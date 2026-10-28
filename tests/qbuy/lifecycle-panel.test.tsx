import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { LifecyclePanel } from "@/components/qbuy/lifecycle";
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
test("awaiting payment never offers an actionable shipment form", () => {
  render(<LifecyclePanel c={fixture("AWAITING_PAYMENT")} admin/>);
  expect(screen.queryByRole("button", { name: "核實並建立物流" })).not.toBeInTheDocument();
  expect(screen.getByText("待核帳並成立正式訂單後，才可建立物流。")).toBeVisible();
});
test("future shipment deadline has an explicit explanation instead of a rejecting form", () => {
  render(<LifecyclePanel c={fixture("FINALIZED", future)} admin/>);
  expect(screen.queryByRole("button", { name: "核實並建立物流" })).not.toBeInTheDocument();
  expect(screen.getByText(/尚未到出貨等待時間/)).toBeVisible();
});
test("a cancellation in review blocks the affected group's shipment controls", () => {
  render(<LifecyclePanel c={fixture("FINALIZED", past, true)} admin/>);
  expect(screen.queryByRole("button", { name: "核實並建立物流" })).not.toBeInTheDocument();
  expect(screen.getByText("取消申請待處置，暫停此群組出貨。")).toBeVisible();
});
test("paid, finalized and due group offers a shipment command for server revalidation", () => {
  render(<LifecyclePanel c={fixture()} admin/>);
  expect(screen.getByRole("button", { name: "核實並建立物流" })).toBeVisible();
});

test.each(["PENDING", "PROCESSING", "ERROR", "REFUNDED"])("refund %s has customer wording and only applicable admin actions", status => {
  const c = fixture();
  c.refunds = [{ id: "refund", reason: "CANCELLATION", amount: 100, status, processedAt: status === "REFUNDED" ? past : null }] as Purchase["refunds"];
  const { rerender } = render(<LifecyclePanel c={c}/>);
  expect(screen.getByText(/訂單取消退款 · NT\$100/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "記錄退款處理結果" })).toBeNull();
  expect(screen.queryByText(/CANCELLATION/)).toBeNull();
  rerender(<LifecyclePanel c={c} admin/>);
  if (status === "REFUNDED") expect(screen.queryByRole("button", { name: "記錄退款處理結果" })).toBeNull();
  else {
    expect(screen.getByRole("button", { name: "記錄退款處理結果" })).toBeVisible();
    const options = [...screen.getByLabelText("處理狀態").querySelectorAll("option")].map(option => option.value);
    expect(options.includes("REFUNDED")).toBe(status === "PROCESSING");
  }
});

test.each(["CREATED", "SHIPPED", "IN_TRANSIT", "READY", "DELIVERED", "COMPLETED", "RETURNED", "VOIDED"])("shipment %s only exposes compatible next steps", status => {
  const c = fixture();
  c.qbShipments = [{ id: "shipment", fulfillmentGroupId: "shipping", trackingNumber: "UX-TRACK", status, method: "HOME_DELIVERY", delivery: { customerName: "合成顧客", address: "測試地址" }, events: [] }] as unknown as Purchase["qbShipments"];
  render(<LifecyclePanel c={c} admin/>);
  const command = screen.queryByRole("button", { name: "記錄核實物流事件" });
  expect(Boolean(command)).toBe(!["COMPLETED", "RETURNED", "VOIDED"].includes(status));
  expect(Boolean(screen.queryByRole("button", { name: "確認 QBUY 實際收到退回包裹" }))).toBe(status === "RETURNED");
  if (status === "CREATED") expect(screen.getByLabelText("新狀態")).toHaveValue("SHIPPED");
  if (status === "DELIVERED") expect(screen.getByLabelText("新狀態").querySelectorAll("option")).toHaveLength(1);
});

test.each(["RECEIVED", "QUALITY_HOLD", "AWAITING_FEE", "READY_TO_RESEND", "RESENT"])("return %s has the appropriate inspection, fee or resend command", status => {
  const c = fixture();
  c.qbShipments = [{ id: "shipment", fulfillmentGroupId: "shipping", trackingNumber: "UX-RETURN", status: "RETURNED", method: "HOME_DELIVERY", delivery: {}, events: [] }] as unknown as Purchase["qbShipments"];
  c.returns = [{ id: "return", shipmentId: "shipment", status, receivedAt: past, deadline: future, fee: 60, paidAt: null }] as unknown as Purchase["returns"];
  render(<LifecyclePanel c={c} admin/>);
  expect(Boolean(screen.queryByRole("button", { name: "記錄數量品檢與重寄報價" }))).toBe(["RECEIVED", "QUALITY_HOLD"].includes(status));
  expect(Boolean(screen.queryByRole("button", { name: "確認重寄運費實際入帳" }))).toBe(status === "AWAITING_FEE");
  expect(Boolean(screen.queryByRole("button", { name: "建立新重寄物流" }))).toBe(status === "READY_TO_RESEND");
});

test.each(["PENDING", "REVIEW_REQUIRED", "REJECTED", "APPROVED", "WITHDRAWN"])("cancellation %s preserves customer and admin capabilities", status => {
  const c = fixture("FINALIZED", future, true);
  c.cancellations[0].status = status;
  const { rerender } = render(<LifecyclePanel c={c}/>);
  expect(Boolean(screen.queryByRole("button", { name: "撤回待審申請" }))).toBe(status === "PENDING");
  expect(screen.queryByRole("button", { name: "核准取消" })).toBeNull();
  rerender(<LifecyclePanel c={c} admin/>);
  expect(Boolean(screen.queryByRole("button", { name: "核准取消" }))).toBe(["PENDING", "REVIEW_REQUIRED"].includes(status));
  expect(Boolean(screen.queryByRole("button", { name: "拒絕取消" }))).toBe(["PENDING", "REVIEW_REQUIRED"].includes(status));
});
