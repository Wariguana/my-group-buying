import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { publicGroupBuySlugSchema } from "@/lib/group-buys/public";
import {
  generateOrderAccessToken,
  hashOrderAccessToken,
} from "@/lib/orders/access-token";
import { OrderDomainError } from "@/lib/orders/errors";
import { calculateOrderTotal } from "@/lib/orders/money";
import { allocateOrderNumber } from "@/lib/orders/order-number-sequence";
import {
  consumeSevenElevenSelection,
  resolveSevenElevenSelectionForOrder,
} from "@/lib/logistics/store-selection";
import { retryOrderTransaction } from "@/lib/orders/retry";
import { orderInputSchema, type OrderInput } from "@/lib/orders/validation";

export type CreateOrderResult = Readonly<{
  publicCode: string;
  orderNumber: string;
  status: "PLACED";
  totalAmount: number;
  accessToken: string;
}>;

const groupBuySelect = {
  id: true,
  status: true,
  startAt: true,
  endAt: true,
  allowsSelfPickup: true,
  allowsSevenEleven: true,
} satisfies Prisma.GroupBuySelect;

const pickupSelect = {
  id: true,
  groupBuyId: true,
  pickupStartAt: true,
  pickupEndAt: true,
  pickupLocation: {
    select: { name: true, address: true, isActive: true },
  },
} satisfies Prisma.GroupBuyPickupSelect;

const itemSelect = {
  id: true,
  groupBuyId: true,
  salePrice: true,
  stock: true,
  purchaseLimit: true,
  isActive: true,
  product: {
    select: { name: true, unit: true, isActive: true },
  },
} satisfies Prisma.GroupBuyItemSelect;

type TransactionClient = Prisma.TransactionClient;
type SelectedItem = Prisma.GroupBuyItemGetPayload<{ select: typeof itemSelect }>;

function fail(code: ConstructorParameters<typeof OrderDomainError>[0]): never {
  throw new OrderDomainError(code);
}

function canonicalUuid(value: string): string {
  return value.toLowerCase();
}

function compareCanonicalUuid(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function validateConsumedQuantity(value: number | null): bigint {
  const consumed = value ?? 0;
  if (!Number.isSafeInteger(consumed) || consumed < 0) fail("FAILED");
  return BigInt(consumed);
}

async function validatePurchaseLimits(
  tx: TransactionClient,
  groupBuyId: string,
  customerId: string | undefined,
  orderedItems: readonly Readonly<{ request: OrderInput["items"][number]; row: SelectedItem }>[],
): Promise<void> {
  for (const { request, row } of orderedItems) {
    if (row.purchaseLimit === null) continue;
    if (!Number.isSafeInteger(row.purchaseLimit) || row.purchaseLimit < 0) fail("FAILED");

    const consumed = customerId
      ? validateConsumedQuantity((await tx.orderItem.aggregate({
        where: {
          groupBuyItemId: row.id,
          order: { customerId, groupBuyId, status: "PLACED" },
        },
        _sum: { quantity: true },
      }))._sum.quantity)
      : BigInt(0);

    if (consumed + BigInt(request.quantity) > BigInt(row.purchaseLimit)) {
      fail("PURCHASE_LIMIT_EXCEEDED");
    }
  }
}

async function runCreateOrderAttempt(
  tx: TransactionClient,
  slug: string,
  input: OrderInput,
  publicCode: string,
  accessToken: string,
  accessTokenHash: string,
  now: Date,
  storeSelectionBinding: string | undefined,
): Promise<CreateOrderResult> {
  const groupBuy = await tx.groupBuy.findUnique({
    where: { slug },
    select: groupBuySelect,
  });
  if (
    !groupBuy ||
    groupBuy.status !== "PUBLISHED" ||
    groupBuy.startAt > now ||
    now >= groupBuy.endAt
  ) {
    fail("GROUP_BUY_NOT_ORDERABLE");
  }

  const pickup = input.fulfillmentMethod === "SELF_PICKUP"
    ? await tx.groupBuyPickup.findUnique({ where: { id: input.groupBuyPickupId }, select: pickupSelect })
    : null;
  if (input.fulfillmentMethod === "SELF_PICKUP" && (
    groupBuy.allowsSelfPickup === false
    || !pickup
    || pickup.groupBuyId !== groupBuy.id
    || !pickup.pickupLocation.isActive
  )) fail("PICKUP_NOT_AVAILABLE");

  const storeSelection = input.fulfillmentMethod === "SEVEN_ELEVEN" && groupBuy.allowsSevenEleven && storeSelectionBinding
    ? await resolveSevenElevenSelectionForOrder(
      tx,
      groupBuy.id,
      input.storeSelectionToken,
      storeSelectionBinding,
      now,
    )
    : null;
  if (input.fulfillmentMethod === "SEVEN_ELEVEN" && (
    !storeSelection
    || !storeSelection.storeId
    || !storeSelection.storeName
    || !storeSelection.storeAddress
  )) fail("STORE_SELECTION_INVALID");

  const requests = [...input.items].sort((left, right) =>
    compareCanonicalUuid(left.groupBuyItemId, right.groupBuyItemId));
  const selectedRows = await tx.groupBuyItem.findMany({
    where: { id: { in: requests.map((item) => item.groupBuyItemId) } },
    select: itemSelect,
  });
  const rowsById = new Map(
    selectedRows.map((row) => [canonicalUuid(row.id), row] as const),
  );
  const orderedItems = requests.map((request) => ({
    request,
    row: rowsById.get(request.groupBuyItemId),
  }));
  if (orderedItems.some(({ row }) =>
    !row || row.groupBuyId !== groupBuy.id || !row.isActive || !row.product.isActive)) {
    fail("ITEM_NOT_AVAILABLE");
  }
  const availableItems = orderedItems as readonly Readonly<{
    request: OrderInput["items"][number];
    row: SelectedItem;
  }>[];
  if (availableItems.some(({ request, row }) =>
    request.expectedUnitPrice !== row.salePrice)) {
    fail("PRICE_CHANGED");
  }

  const existingCustomer = await tx.customer.findUnique({
    where: { phone: input.customerPhone },
    select: { id: true },
  });
  await validatePurchaseLimits(
    tx,
    groupBuy.id,
    existingCustomer?.id,
    availableItems,
  );

  const totalAmount = calculateOrderTotal(availableItems.map(({ request, row }) => ({
    price: row.salePrice,
    quantity: request.quantity,
  })));

  const customer = existingCustomer ?? await tx.customer.upsert({
    where: { phone: input.customerPhone },
    create: { phone: input.customerPhone },
    update: {},
    select: { id: true },
  });
  const orderNumber = await allocateOrderNumber(tx, now);
  if (orderNumber === null) fail("FAILED");
  const order = await tx.order.create({
    data: {
      publicCode,
      orderNumber,
      accessTokenHash,
      groupBuyId: groupBuy.id,
      customerId: customer.id,
      groupBuyPickupId: pickup?.id ?? null,
      status: "PLACED",
      fulfillmentMethod: input.fulfillmentMethod,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      pickupName: pickup?.pickupLocation.name ?? null,
      pickupAddress: pickup?.pickupLocation.address ?? null,
      pickupStartAt: pickup?.pickupStartAt ?? null,
      pickupEndAt: pickup?.pickupEndAt ?? null,
      sevenElevenStoreId: storeSelection?.storeId ?? null,
      sevenElevenStoreName: storeSelection?.storeName ?? null,
      sevenElevenStoreAddress: storeSelection?.storeAddress ?? null,
      totalAmount,
      createdAt: now,
    },
    select: { id: true },
  });

  if (storeSelection && !await consumeSevenElevenSelection(tx, storeSelection.id, order.id, now)) {
    fail("STORE_SELECTION_INVALID");
  }

  for (const { request, row } of availableItems) {
    if (row.stock === null) continue;
    const allocation = await tx.groupBuyItem.updateMany({
      where: {
        id: row.id,
        groupBuyId: groupBuy.id,
        stock: { gte: request.quantity },
      },
      data: { stock: { decrement: request.quantity } },
    });
    if (allocation.count !== 1) fail("INSUFFICIENT_STOCK");
  }

  await tx.orderItem.createMany({
    data: availableItems.map(({ request, row }) => ({
      orderId: order.id,
      groupBuyItemId: row.id,
      productName: row.product.name,
      unit: row.product.unit,
      unitPrice: row.salePrice,
      quantity: request.quantity,
    })),
  });

  return Object.freeze({ publicCode, orderNumber, status: "PLACED", totalAmount, accessToken });
}

export async function createOrder(
  groupBuySlug: unknown,
  input: unknown,
  context: Readonly<{ storeSelectionBinding?: string }> = {},
): Promise<CreateOrderResult> {
  const parsedSlug = publicGroupBuySlugSchema.safeParse(groupBuySlug);
  const parsedInput = orderInputSchema.safeParse(input);
  if (!parsedSlug.success || !parsedInput.success) fail("INVALID_ORDER_INPUT");

  let accessToken: string;
  let accessTokenHash: string;
  try {
    accessToken = generateOrderAccessToken();
    accessTokenHash = hashOrderAccessToken(accessToken);
  } catch {
    fail("FAILED");
  }

  return retryOrderTransaction(({ publicCode }) => {
    const now = new Date();
    return getDb().$transaction(
      (tx) => runCreateOrderAttempt(
        tx,
        parsedSlug.data,
        parsedInput.data,
        publicCode,
        accessToken,
        accessTokenHash,
        now,
        context.storeSelectionBinding,
      ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });
}
