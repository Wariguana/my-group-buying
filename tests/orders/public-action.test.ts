// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  createOrder: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/orders/service", () => ({ createOrder: boundary.createOrder }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));

import { submitPublicOrderAction } from "@/app/group-buys/[slug]/actions";
import { initialPublicOrderActionState } from "@/app/group-buys/[slug]/order-action-state";
import { OrderDomainError, type OrderErrorCode } from "@/lib/orders/errors";

const slug = "gb-AbCdEf0123_-xyZ9";
const pickupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemAId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const itemBId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const itemCId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function validForm() {
  const form = new FormData();
  form.set("groupBuySlug", slug);
  form.set("customerName", "王小明");
  form.set("customerPhone", "+886912345678");
  form.set("groupBuyPickupId", pickupId);
  form.set(`item:${itemAId}`, "2");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.createOrder.mockResolvedValue({
    publicCode: "ord-AbCdEf0123_-xyZ9",
    status: "PLACED",
    totalAmount: 300,
  });
});

test("valid FormData calls createOrder with only the public slug and allowed order fields", async () => {
  const form = validForm();
  form.set(`item:${itemAId}`, "0");
  form.set(`item:${itemBId}`, "");
  form.set(`item:${itemCId}`, "3");
  form.set("clientTotal", "1");

  await submitPublicOrderAction(initialPublicOrderActionState, form);
  expect(boundary.createOrder).toHaveBeenCalledExactlyOnceWith(slug, {
    customerName: "王小明",
    customerPhone: "+886912345678",
    groupBuyPickupId: pickupId,
    items: [{ groupBuyItemId: itemCId, quantity: 3 }],
  });
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

test("success exposes only publicCode and totalAmount and revalidates the literal detail path", async () => {
  const result = await submitPublicOrderAction(initialPublicOrderActionState, validForm());
  expect(result).toEqual({
    status: "success",
    publicCode: "ord-AbCdEf0123_-xyZ9",
    totalAmount: 300,
  });
  expect(Object.keys(result).sort()).toEqual(["publicCode", "status", "totalAmount"]);
  expect(boundary.revalidatePath).toHaveBeenCalledExactlyOnceWith(`/group-buys/${slug}`);
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
  });
  expect(result).not.toHaveProperty("message");
  expect(JSON.stringify(result)).not.toContain("private revalidation failure");
  expect(boundary.createOrder).toHaveBeenCalledTimes(1);
  expect(boundary.revalidatePath).toHaveBeenCalledExactlyOnceWith(`/group-buys/${slug}`);
});
