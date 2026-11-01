import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { LifecyclePanel } from "@/components/consumer/qbuy/lifecycle";
import type { customerLifecycle } from "@/lib/qbuy/queries";
type Purchase = NonNullable<Awaited<ReturnType<typeof customerLifecycle>>>;
const past = new Date("2020-01-01T00:00:00Z"), future = new Date("2099-01-01T00:00:00Z");
function fixture(status = "FINALIZED", deadline = past, pending = false): Purchase {
  // Synthetic projection containing exactly the fields read by this server component.
  return {
    totalAmount: 160, createdAt: past, status,
    orders: [{ id: "order", groupBuyId: "group", orderNumber: "QB202610280001", status: "PAID" }],
    items: [{ id: "item", groupBuyId: "group", fulfillmentGroupId: "shipping", groupTitle: "合成測試團", productName: "測試商品", quantity: 1, unitPrice: 100, discount: 0, groupBuy: { endAt: deadline } }],
    fulfillmentGroups: [{ id: "shipping", method: "HOME_DELIVERY", temperature: "AMBIENT", shippingAmount: 60, waitUntil: deadline, rateSnapshot: { fee: 60, freeThreshold: null }, adjustments: [] }],
    cancellations: pending ? [{ id: "request", orderId: "order", status: "PENDING", submittedAt: past, reason: "不需要" }] : [],
    refunds: [], qbShipments: [], returns: [],
  } as unknown as Purchase;
}
afterEach(cleanup);

test.each(["PENDING", "PROCESSING", "ERROR", "REFUNDED"])("refund %s exposes customer wording without administrative actions", status => {
  const c = fixture();
  c.refunds = [{ id: "refund", reason: "CANCELLATION", amount: 100, status, processedAt: status === "REFUNDED" ? past : null }] as Purchase["refunds"];
  render(<LifecyclePanel c={c}/>);
  expect(screen.getByText(/訂單取消退款 · NT\$100/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "記錄退款處理結果" })).toBeNull();
  expect(screen.queryByText(/CANCELLATION/)).toBeNull();
});
test.each(["PENDING", "REVIEW_REQUIRED", "REJECTED", "APPROVED", "WITHDRAWN"])("cancellation %s preserves the customer's permitted actions", status => {
  const c = fixture("FINALIZED", future, true); c.cancellations[0].status = status;
  render(<LifecyclePanel c={c}/>);
  expect(Boolean(screen.queryByRole("button", { name: "撤回待審申請" }))).toBe(status === "PENDING");
  expect(screen.queryByRole("button", { name: "核准取消" })).toBeNull();
  expect(screen.queryByRole("button", { name: "拒絕取消" })).toBeNull();
});
test.each(["CREATED", "SHIPPED", "IN_TRANSIT", "READY", "DELIVERED", "COMPLETED", "RETURNED", "VOIDED"])("shipment %s shows history without administrative commands", status => {
  const c = fixture();
  c.qbShipments = [{ id: "shipment", fulfillmentGroupId: "shipping", trackingNumber: "UX-TRACK", status, method: "HOME_DELIVERY", delivery: { customerName: "合成顧客", address: "測試地址" }, events: [] }] as unknown as Purchase["qbShipments"];
  render(<LifecyclePanel c={c}/>);
  expect(screen.getByText(/UX-TRACK/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "記錄核實物流事件" })).toBeNull();
  expect(screen.queryByRole("button", { name: "確認 QBUY 實際收到退回包裹" })).toBeNull();
});
test("closed groups retain the customer cancellation explanation", () => {
  render(<LifecyclePanel c={fixture()}/>);
  expect(screen.getByText(/團購已截止，已關閉取消申請/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "提出取消申請" })).toBeNull();
});
