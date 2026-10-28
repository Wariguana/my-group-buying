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
