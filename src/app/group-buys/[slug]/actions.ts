"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { OrderErrorCode } from "@/lib/orders/errors";
import { OrderDomainError } from "@/lib/orders/errors";
import {
  ORDER_ACCESS_COOKIE_NAME,
  orderAccessCookieOptions,
} from "@/lib/orders/access-cookie";
import { createOrder } from "@/lib/orders/service";
import {
  createStoreSelectionBinding,
  isValidStoreSelectionBinding,
  STORE_SELECTION_BINDING_COOKIE,
  storeSelectionBindingCookieOptions,
} from "@/lib/logistics/store-selection-cookie";
import { beginSevenElevenStoreSelection } from "@/lib/logistics/store-selection";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import type { PublicOrderActionState } from "./order-action-state";

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const INVALID_INPUT_MESSAGE = "請確認姓名、手機、取貨地點與商品數量。";

const publicMessages: Record<OrderErrorCode, string> = {
  INVALID_ORDER_INPUT: INVALID_INPUT_MESSAGE,
  GROUP_BUY_NOT_ORDERABLE: "此團購目前無法接受訂單。",
  ITEM_NOT_AVAILABLE: "部分商品目前無法訂購，請重新整理後再試。",
  PRICE_CHANGED: "商品價格已更新，請重新整理頁面後確認最新訂單金額。",
  PICKUP_NOT_AVAILABLE: "此取貨地點目前無法使用，請重新整理後再試。",
  STORE_SELECTION_INVALID: "7-ELEVEN 門市選擇已失效或無效，請重新選擇門市。",
  INSUFFICIENT_STOCK: "商品庫存不足，請重新整理後調整數量。",
  PURCHASE_LIMIT_EXCEEDED: "訂購數量超過此商品的限購數量。",
  CONFLICT_RETRY_EXHAUSTED: "同時訂購人數較多，請再試一次。",
  FAILED: "訂單送出失敗，請稍後再試。",
};

type ParsedForm = Readonly<{
  slug: string;
  input: ({
    customerName: string;
    customerPhone: string;
    fulfillmentMethod: "SELF_PICKUP";
    groupBuyPickupId: string;
    items: { groupBuyItemId: string; expectedUnitPrice: number; quantity: number }[];
  } | {
    customerName: string;
    customerPhone: string;
    fulfillmentMethod: "SEVEN_ELEVEN";
    storeSelectionToken: string;
    items: { groupBuyItemId: string; expectedUnitPrice: number; quantity: number }[];
  });
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

function parseExpectedUnitPrice(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const price = Number(value);
  return Number.isSafeInteger(price) && price <= MAX_POSTGRES_INTEGER
    ? price
    : null;
}

function parsePublicOrderForm(formData: FormData): ParsedForm | null {
  const slug = singleString(formData, "groupBuySlug");
  const customerName = singleString(formData, "customerName");
  const customerPhone = singleString(formData, "customerPhone");
  const submittedFulfillmentMethod = singleString(formData, "fulfillmentMethod");
  const fulfillmentMethod = submittedFulfillmentMethod ?? (singleString(formData, "groupBuyPickupId") ? "SELF_PICKUP" : null);
  if (
    slug === null ||
    customerName === null ||
    customerPhone === null ||
    (fulfillmentMethod !== "SELF_PICKUP" && fulfillmentMethod !== "SEVEN_ELEVEN")
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
    if (quantity !== undefined) {
      const submittedPrice = singleString(formData, `price:${groupBuyItemId}`);
      if (submittedPrice === null) return null;
      const expectedUnitPrice = parseExpectedUnitPrice(submittedPrice);
      if (expectedUnitPrice === null) return null;
      items.push({ groupBuyItemId, expectedUnitPrice, quantity });
    }
  }
  if (items.length === 0) return null;

  if (fulfillmentMethod === "SELF_PICKUP") {
    const groupBuyPickupId = singleString(formData, "groupBuyPickupId");
    return groupBuyPickupId === null ? null : {
      slug,
      input: { customerName, customerPhone, fulfillmentMethod, groupBuyPickupId, items },
    };
  }
  const storeSelectionToken = singleString(formData, "storeSelectionToken");
  return storeSelectionToken === null ? null : {
    slug,
    input: { customerName, customerPhone, fulfillmentMethod, storeSelectionToken, items },
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
    const customerAccount = await getCurrentCustomerAccount();
    if (parsed.input.fulfillmentMethod === "SEVEN_ELEVEN") {
      const cookieStore = await cookies();
      result = await createOrder(parsed.slug, parsed.input, {
        storeSelectionBinding: cookieStore.get(STORE_SELECTION_BINDING_COOKIE)?.value,
        authenticatedCustomerAccountId: customerAccount?.id ?? null,
      });
    } else {
      result = await createOrder(parsed.slug, parsed.input, {
        authenticatedCustomerAccountId: customerAccount?.id ?? null,
      });
    }
  } catch (error) {
    return error instanceof OrderDomainError
      ? errorState(error.code)
      : errorState("FAILED");
  }

  try {
    const cookieStore = await cookies();
    cookieStore.set(
      ORDER_ACCESS_COOKIE_NAME,
      result.accessToken,
      orderAccessCookieOptions(result.publicCode),
    );
  } catch {
    // The order has already committed. The management code remains the
    // recovery credential when this best-effort browser handoff fails.
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
    orderNumber: result.orderNumber,
    totalAmount: result.totalAmount,
    managementCode: result.accessToken,
  };
}

export async function startSevenElevenStoreSelectionAction(slug: string): Promise<void> {
  let state: string;
  try {
    const cookieStore = await cookies();
    const existingBinding = cookieStore.get(STORE_SELECTION_BINDING_COOKIE)?.value;
    const browserBinding = isValidStoreSelectionBinding(existingBinding)
      ? existingBinding
      : createStoreSelectionBinding();
    state = (await beginSevenElevenStoreSelection(slug, browserBinding)).state;
    cookieStore.set(
      STORE_SELECTION_BINDING_COOKIE,
      browserBinding,
      storeSelectionBindingCookieOptions(),
    );
  } catch {
    redirect(`/group-buys/${encodeURIComponent(slug)}?storeSelectionError=unavailable`);
  }
  redirect(`/api/logistics/ecpay/store-map/start?state=${encodeURIComponent(state)}`);
}
