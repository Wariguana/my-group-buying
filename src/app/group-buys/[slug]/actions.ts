"use server";

import { revalidatePath } from "next/cache";
import type { OrderErrorCode } from "@/lib/orders/errors";
import { OrderDomainError } from "@/lib/orders/errors";
import { createOrder } from "@/lib/orders/service";
import type { PublicOrderActionState } from "./order-action-state";

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const INVALID_INPUT_MESSAGE = "請確認姓名、手機、取貨地點與商品數量。";

const publicMessages: Record<OrderErrorCode, string> = {
  INVALID_ORDER_INPUT: INVALID_INPUT_MESSAGE,
  GROUP_BUY_NOT_ORDERABLE: "此團購目前無法接受訂單。",
  ITEM_NOT_AVAILABLE: "部分商品目前無法訂購，請重新整理後再試。",
  PICKUP_NOT_AVAILABLE: "此取貨地點目前無法使用，請重新整理後再試。",
  INSUFFICIENT_STOCK: "商品庫存不足，請重新整理後調整數量。",
  PURCHASE_LIMIT_EXCEEDED: "訂購數量超過此商品的限購數量。",
  CONFLICT_RETRY_EXHAUSTED: "同時訂購人數較多，請再試一次。",
  FAILED: "訂單送出失敗，請稍後再試。",
};

type ParsedForm = Readonly<{
  slug: string;
  input: {
    customerName: string;
    customerPhone: string;
    groupBuyPickupId: string;
    items: { groupBuyItemId: string; quantity: number }[];
  };
}>;

function singleString(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

function parseQuantity(value: string): number | null | undefined {
  if (value === "" || value === "0") return undefined;
  if (!/^[0-9]+$/.test(value)) return null;
  const quantity = Number(value);
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_POSTGRES_INTEGER
  ) {
    return null;
  }
  return quantity;
}

function parsePublicOrderForm(formData: FormData): ParsedForm | null {
  const slug = singleString(formData, "groupBuySlug");
  const customerName = singleString(formData, "customerName");
  const customerPhone = singleString(formData, "customerPhone");
  const groupBuyPickupId = singleString(formData, "groupBuyPickupId");
  if (
    slug === null ||
    customerName === null ||
    customerPhone === null ||
    groupBuyPickupId === null
  ) {
    return null;
  }

  const items: ParsedForm["input"]["items"] = [];
  const seenItemIds = new Set<string>();
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("item:")) continue;
    const groupBuyItemId = name.slice("item:".length);
    if (
      groupBuyItemId === "" ||
      seenItemIds.has(groupBuyItemId) ||
      typeof value !== "string"
    ) {
      return null;
    }
    seenItemIds.add(groupBuyItemId);
    const quantity = parseQuantity(value);
    if (quantity === null) return null;
    if (quantity !== undefined) items.push({ groupBuyItemId, quantity });
  }
  if (items.length === 0) return null;

  return {
    slug,
    input: { customerName, customerPhone, groupBuyPickupId, items },
  };
}

function errorState(code: OrderErrorCode): PublicOrderActionState {
  return { status: "error", message: publicMessages[code] };
}

export async function submitPublicOrderAction(
  _previousState: PublicOrderActionState,
  formData: FormData,
): Promise<PublicOrderActionState> {
  const parsed = parsePublicOrderForm(formData);
  if (!parsed) return errorState("INVALID_ORDER_INPUT");

  let result;
  try {
    result = await createOrder(parsed.slug, parsed.input);
  } catch (error) {
    return error instanceof OrderDomainError
      ? errorState(error.code)
      : errorState("FAILED");
  }

  try {
    revalidatePath(`/group-buys/${parsed.slug}`);
  } catch {
    // The order has already committed. Revalidation is best-effort and must
    // not turn a successful submission into a retryable-looking failure.
  }
  return {
    status: "success",
    publicCode: result.publicCode,
    totalAmount: result.totalAmount,
  };
}
