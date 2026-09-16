// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  createOrder: vi.fn(),
  revalidatePath: vi.fn(),
  cookies: vi.fn(),
  setCookie: vi.fn(),
  getCookie: vi.fn(),
  beginStoreSelection: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/orders/service", () => ({ createOrder: boundary.createOrder }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));
vi.mock("@/lib/logistics/store-selection", () => ({
  beginSevenElevenStoreSelection: boundary.beginStoreSelection,
}));

import {
  startSevenElevenStoreSelectionAction,
  submitPublicOrderAction,
} from "@/app/group-buys/[slug]/actions";
import { initialPublicOrderActionState } from "@/app/group-buys/[slug]/order-action-state";
import { OrderDomainError, type OrderErrorCode } from "@/lib/orders/errors";

const slug = "gb-AbCdEf0123_-xyZ9";
const pickupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemAId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const itemBId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const itemCId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const accessToken = "A".repeat(43);

function validForm() {
  const form = new FormData();
  form.set("groupBuySlug", slug);
  form.set("customerName", "王小明");
  form.set("customerPhone", "+886912345678");
  form.set("fulfillmentMethod", "SELF_PICKUP");
  form.set("groupBuyPickupId", pickupId);
  form.set(`item:${itemAId}`, "2");
  form.set(`price:${itemAId}`, "150");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.cookies.mockResolvedValue({ get: boundary.getCookie, set: boundary.setCookie });
  boundary.beginStoreSelection.mockResolvedValue({ state: "ABCDEFGHIJKLMNOPQRST" });
  boundary.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  boundary.createOrder.mockResolvedValue({
    publicCode: "ord-AbCdEf0123_-xyZ9",
    status: "PLACED",
    totalAmount: 300,
    accessToken,
  });
});

test("store selection initiation creates and persists a browser binding before redirect", async () => {
  await expect(startSevenElevenStoreSelectionAction(slug)).rejects.toThrow("NEXT_REDIRECT");
  const generatedBinding = boundary.beginStoreSelection.mock.calls[0][1];
  expect(generatedBinding).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(boundary.setCookie).toHaveBeenCalledWith(
    "seven_eleven_selection_binding",
    generatedBinding,
    { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 3600 },
  );
  expect(boundary.redirect).toHaveBeenCalledWith(
    "/api/logistics/ecpay/store-map/start?state=ABCDEFGHIJKLMNOPQRST",
  );
});

test("store selection initiation reuses and refreshes a valid existing binding", async () => {
  const existingBinding = "B".repeat(43);
  boundary.getCookie.mockReturnValue({ value: existingBinding });
  await expect(startSevenElevenStoreSelectionAction(slug)).rejects.toThrow("NEXT_REDIRECT");
  expect(boundary.beginStoreSelection).toHaveBeenCalledExactlyOnceWith(slug, existingBinding);
  expect(boundary.setCookie).toHaveBeenCalledWith(
    "seven_eleven_selection_binding",
    existingBinding,
    expect.objectContaining({ maxAge: 3600 }),
  );
});

test("two concurrent initiations in one browser keep the stable binding", async () => {
  const existingBinding = "C".repeat(43);
  boundary.getCookie.mockReturnValue({ value: existingBinding });
  boundary.beginStoreSelection
    .mockResolvedValueOnce({ state: "ABCDEFGHIJKLMNOPQRST" })
    .mockResolvedValueOnce({ state: "QRSTUVWXYZABCDEFGHIJ" });
  await expect(startSevenElevenStoreSelectionAction(slug)).rejects.toThrow("NEXT_REDIRECT");
  await expect(startSevenElevenStoreSelectionAction(slug)).rejects.toThrow("NEXT_REDIRECT");
  expect(boundary.beginStoreSelection.mock.calls).toEqual([
    [slug, existingBinding],
    [slug, existingBinding],
  ]);
});

test("valid FormData calls createOrder with only the public slug and allowed order fields", async () => {
  const form = validForm();
  form.set(`item:${itemAId}`, "0");
  form.set(`item:${itemBId}`, "");
  form.set(`item:${itemCId}`, "3");
  form.set(`price:${itemCId}`, "250");
  form.set("clientTotal", "1");

  await submitPublicOrderAction(initialPublicOrderActionState, form);
  expect(boundary.createOrder).toHaveBeenCalledExactlyOnceWith(slug, {
    customerName: "王小明",
    customerPhone: "+886912345678",
    fulfillmentMethod: "SELF_PICKUP",
    groupBuyPickupId: pickupId,
    items: [{ groupBuyItemId: itemCId, expectedUnitPrice: 250, quantity: 3 }],
  });
});

test.each([
  ["missing", null],
  ["negative", "-1"],
  ["fractional", "1.5"],
  ["overflow", "2147483648"],
])("rejects %s displayed price before service invocation", async (_label, price) => {
  const form = validForm();
  if (price === null) form.delete(`price:${itemAId}`);
  else form.set(`price:${itemAId}`, price);
  expect(await submitPublicOrderAction(initialPublicOrderActionState, form)).toMatchObject({
    status: "error",
  });
  expect(boundary.createOrder).not.toHaveBeenCalled();
});

test("rejects duplicate displayed-price fields instead of ambiguously pairing them", async () => {
  const form = validForm();
  form.append(`price:${itemAId}`, "150");
  expect(await submitPublicOrderAction(initialPublicOrderActionState, form)).toMatchObject({
    status: "error",
  });
  expect(boundary.createOrder).not.toHaveBeenCalled();
});

test("blank and exact zero quantities are omitted, leaving no positive item as safe invalid input", async () => {
  const form = validForm();
  form.set(`item:${itemAId}`, "0");
  form.set(`item:${itemBId}`, "");
  await expect(submitPublicOrderAction(initialPublicOrderActionState, form)).resolves.toEqual({
    status: "error",
    message: "請確認姓名、手機、取貨地點與商品數量。",
  });
  expect(boundary.createOrder).not.toHaveBeenCalled();
});

test.each(["1.5", "1e3", "0x10", "Infinity", "2147483648"])(
  "rejects malformed or unsafe quantity %s before service invocation",
  async (quantity) => {
    const form = validForm();
    form.set(`item:${itemAId}`, quantity);
    expect(await submitPublicOrderAction(initialPublicOrderActionState, form)).toEqual({
      status: "error",
      message: "請確認姓名、手機、取貨地點與商品數量。",
    });
    expect(boundary.createOrder).not.toHaveBeenCalled();
  },
);

test("rejects mismatched selector/quantity encoding", async () => {
  const form = validForm();
  form.delete(`item:${itemAId}`);
  form.set("groupBuyItemId", itemAId);
  form.set("quantity", "2");
  expect(await submitPublicOrderAction(initialPublicOrderActionState, form)).toMatchObject({
    status: "error",
  });
  expect(boundary.createOrder).not.toHaveBeenCalled();
});

test("rejects duplicate dynamic item fields instead of ambiguously pairing them", async () => {
  const form = validForm();
  form.append(`item:${itemAId}`, "3");
  expect(await submitPublicOrderAction(initialPublicOrderActionState, form)).toMatchObject({
    status: "error",
  });
  expect(boundary.createOrder).not.toHaveBeenCalled();
});

test.each([
  ["INVALID_ORDER_INPUT", "請確認姓名、手機、取貨地點與商品數量。"],
  ["GROUP_BUY_NOT_ORDERABLE", "此團購目前無法接受訂單。"],
  ["ITEM_NOT_AVAILABLE", "部分商品目前無法訂購，請重新整理後再試。"],
  ["PRICE_CHANGED", "商品價格已更新，請重新整理頁面後確認最新訂單金額。"],
  ["PICKUP_NOT_AVAILABLE", "此取貨地點目前無法使用，請重新整理後再試。"],
  ["INSUFFICIENT_STOCK", "商品庫存不足，請重新整理後調整數量。"],
  ["PURCHASE_LIMIT_EXCEEDED", "訂購數量超過此商品的限購數量。"],
  ["CONFLICT_RETRY_EXHAUSTED", "同時訂購人數較多，請再試一次。"],
  ["FAILED", "訂單送出失敗，請稍後再試。"],
] as const)("maps %s to a safe public message", async (code, message) => {
  boundary.createOrder.mockRejectedValue(new OrderDomainError(code as OrderErrorCode));
  expect(await submitPublicOrderAction(initialPublicOrderActionState, validForm())).toEqual({
    status: "error",
    message,
  });
});

test("maps unknown thrown values to the generic safe failure", async () => {
  boundary.createOrder.mockRejectedValue(new Error("private database detail"));
  expect(await submitPublicOrderAction(initialPublicOrderActionState, validForm())).toEqual({
    status: "error",
    message: "訂單送出失敗，請稍後再試。",
  });
});

test("success exposes the one-time management code and writes a path-scoped HttpOnly cookie", async () => {
  const result = await submitPublicOrderAction(initialPublicOrderActionState, validForm());
  expect(result).toEqual({
    status: "success",
    publicCode: "ord-AbCdEf0123_-xyZ9",
    totalAmount: 300,
    managementCode: accessToken,
  });
  expect(Object.keys(result).sort()).toEqual(["managementCode", "publicCode", "status", "totalAmount"]);
  expect(result).not.toHaveProperty("accessTokenHash");
  expect(result).not.toHaveProperty("id");
  expect(boundary.setCookie).toHaveBeenCalledExactlyOnceWith(
    "order_access",
    accessToken,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/orders/ord-AbCdEf0123_-xyZ9",
    },
  );
  expect(boundary.revalidatePath).toHaveBeenCalledExactlyOnceWith(`/group-buys/${slug}`);
});

test("cookie failure cannot replace an already committed order success or retry creation", async () => {
  boundary.cookies.mockRejectedValue(new Error("private cookie failure"));

  const result = await submitPublicOrderAction(initialPublicOrderActionState, validForm());

  expect(result).toEqual({
    status: "success",
    publicCode: "ord-AbCdEf0123_-xyZ9",
    totalAmount: 300,
    managementCode: accessToken,
  });
  expect(boundary.createOrder).toHaveBeenCalledTimes(1);
  expect(boundary.revalidatePath).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain("private cookie failure");
});

test("cookie and revalidation are independent post-commit best-effort helpers", async () => {
  boundary.setCookie.mockImplementation(() => {
    throw new Error("cookie write failed");
  });
  boundary.revalidatePath.mockImplementation(() => {
    throw new Error("revalidation failed");
  });

  const result = await submitPublicOrderAction(initialPublicOrderActionState, validForm());

  expect(result.status).toBe("success");
  expect(boundary.createOrder).toHaveBeenCalledTimes(1);
  expect(boundary.setCookie).toHaveBeenCalledTimes(1);
  expect(boundary.revalidatePath).toHaveBeenCalledTimes(1);
});

test("revalidation failure cannot replace an already committed order success", async () => {
  boundary.revalidatePath.mockImplementation(() => {
    throw new Error("private revalidation failure");
  });

  const result = await submitPublicOrderAction(initialPublicOrderActionState, validForm());

  expect(result).toEqual({
    status: "success",
    publicCode: "ord-AbCdEf0123_-xyZ9",
    totalAmount: 300,
    managementCode: accessToken,
  });
  expect(result).not.toHaveProperty("message");
  expect(JSON.stringify(result)).not.toContain("private revalidation failure");
  expect(boundary.createOrder).toHaveBeenCalledTimes(1);
  expect(boundary.revalidatePath).toHaveBeenCalledExactlyOnceWith(`/group-buys/${slug}`);
});
