import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listAdminOrders: vi.fn(),
  getAdminOrderByPublicCode: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.requireAdmin }));
vi.mock("@/lib/orders/admin-service", () => ({
  listAdminOrders: boundary.listAdminOrders,
  getAdminOrderByPublicCode: boundary.getAdminOrderByPublicCode,
}));
vi.mock("next/navigation", () => ({ notFound: boundary.notFound }));
vi.mock("@/app/admin/(protected)/orders/[publicCode]/cancel-actions", () => ({ submitAdminCancelOrderAction: vi.fn() }));

vi.mock("@/app/admin/(protected)/orders/[publicCode]/payment-actions", () => ({ submitAdminPaymentOrderAction: vi.fn() }));
vi.mock("@/app/admin/(protected)/orders/[publicCode]/shipment-actions", () => ({
  submitAdminCreateShipmentAction: vi.fn(), submitAdminShipShipmentAction: vi.fn(), submitAdminArriveShipmentAction: vi.fn(),
  submitAdminReturnShipmentAction: vi.fn(), submitAdminVoidShipmentAction: vi.fn(),
}));

import AdminOrdersPage from "@/app/admin/(protected)/orders/page";
import AdminOrderDetailPage from "@/app/admin/(protected)/orders/[publicCode]/page";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const orderNumber = "202609140001";
const createdAt = new Date("2026-09-14T04:00:00.000Z");
const cancelledAt = new Date("2026-09-14T04:30:00.000Z");
const listOrder = {
  publicCode,
  orderNumber,
  status: "CANCELLED" as const,
  customerName: "歷史姓名",
  customerPhone: "+886912345678",
  totalAmount: 300,
  createdAt,
  cancelledAt, pickedUpAt: null, paidAt: null,
  groupBuy: { title: "秋季團購" },
};
const detailOrder = {
  fulfillmentMethod: "SELF_PICKUP" as const,
  shipmentRequired: false, shipmentHistory: [], activeShipmentId: null,
  canCreateShipment: false, shipmentCreationBlockReason: "NOT_REQUIRED",
  allowedShipmentActions: [], canMarkPickedUp: false, pickupBlockReason: "CANCELLED",
  canAdminCancel: false, adminCancellationBlockReason: "CANCELLED",
  publicCode,
  orderNumber,
  status: "CANCELLED" as const,
  customerName: "歷史姓名",
  customerPhone: "+886912345678",
  pickupName: "歷史取貨點",
  pickupAddress: "歷史取貨地址",
  pickupStartAt: new Date("2026-09-15T01:00:00.000Z"),
  pickupEndAt: new Date("2026-09-15T03:00:00.000Z"),
  totalAmount: 300,
  createdAt,
  cancelledAt, pickedUpAt: null, paidAt: null,
  groupBuy: {
    title: "秋季團購",
    startAt: new Date("2026-09-01T01:00:00.000Z"),
    endAt: new Date("2026-09-14T08:00:00.000Z"),
  },
  items: [{
    productName: "歷史商品",
    unit: "袋",
    unitPrice: 150,
    quantity: 2,
    lineSubtotal: 300,
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.requireAdmin.mockResolvedValue({ id: "admin-id" });
  boundary.listAdminOrders.mockResolvedValue({ ok: true, value: [listOrder] });
  boundary.getAdminOrderByPublicCode.mockResolvedValue({ ok: true, value: detailOrder });
});
afterEach(cleanup);

test("admin list renders operational rows and scoped detail links", async () => {
  render(await AdminOrdersPage());
  expect(boundary.requireAdmin).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", { name: "訂單管理" })).toBeVisible();
  const row = screen.getAllByRole("row")[1];
  expect(row).toHaveTextContent(orderNumber);
  expect(row).not.toHaveTextContent(publicCode);
  expect(row).toHaveTextContent("CANCELLED");
  expect(row).toHaveTextContent("歷史姓名");
  expect(row).toHaveTextContent("+886912345678");
  expect(row).toHaveTextContent("秋季團購");
  expect(row).toHaveTextContent("$300");
  expect(row).toHaveTextContent("取消時間");
  expect(screen.getByRole("link", { name: "查看訂單" }))
    .toHaveAttribute("href", `/admin/orders/${publicCode}`);
});

test("admin list renders a safe empty state", async () => {
  boundary.listAdminOrders.mockResolvedValue({ ok: true, value: [] });
  render(await AdminOrdersPage());
  expect(screen.getByText("目前尚無訂單資料。")).toBeVisible();
});

test("admin detail renders snapshots, totals, and stored cancellation time", async () => {
  render(await AdminOrderDetailPage({
    params: Promise.resolve({ publicCode }),
    searchParams: Promise.resolve({}),
  }));
  expect(boundary.requireAdmin).toHaveBeenCalledTimes(1);
  expect(boundary.getAdminOrderByPublicCode).toHaveBeenCalledExactlyOnceWith(publicCode);
  expect(screen.getByRole("heading", { name: orderNumber })).toBeVisible();
  expect(screen.getByText("歷史姓名")).toBeVisible();
  expect(screen.getByText("歷史取貨點")).toBeVisible();
  expect(screen.getByText("歷史取貨地址")).toBeVisible();
  expect(screen.getByText("歷史商品")).toBeVisible();
  expect(screen.getByText(/× 2/)).toBeVisible();
  expect(screen.getByText("CANCELLED")).toBeVisible();
  expect(screen.getByText("取消時間").parentElement).toHaveTextContent("2026/09/14 12:30");
  expect(screen.getAllByText("訂單總額").some((label) => label.parentElement?.textContent?.includes("$300"))).toBe(true);
  expect(screen.queryByRole("button", { name: "取消訂單" })).not.toBeInTheDocument();
});

test("PLACED detail shows Admin cancellation even after cutoff", async () => {
  boundary.getAdminOrderByPublicCode.mockResolvedValue({ ok: true, value: {
    ...detailOrder, status: "PLACED", cancelledAt: null, pickedUpAt: null, paidAt: null,
    canMarkPickedUp: true, canAdminCancel: true, pickupBlockReason: null, adminCancellationBlockReason: null,
    groupBuy: { ...detailOrder.groupBuy, endAt: new Date("2000-01-01T00:00:00Z") },
  } });
  render(await AdminOrderDetailPage({ params: Promise.resolve({ publicCode }), searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("button", { name: "取消訂單" })).toBeEnabled();
});


test("picked up Admin detail shows time and removes both controls", async () => {
 boundary.getAdminOrderByPublicCode.mockResolvedValue({ ok: true, value: { ...detailOrder, status: "PLACED", cancelledAt: null, pickedUpAt: new Date("2026-09-15T01:00:00Z") } });
 render(await AdminOrderDetailPage({ params: Promise.resolve({ publicCode }), searchParams: Promise.resolve({}) }));
 expect(screen.getByText(/^已取貨：/)).toHaveTextContent("09:00");
 expect(screen.queryByRole("button", { name: "取消訂單" })).not.toBeInTheDocument();
 expect(screen.queryByRole("button", { name: "標記已取貨" })).not.toBeInTheDocument();
});
test.each([["CANCELLED", null, "已取消"], ["PLACED", null, "待取貨"], ["PLACED", createdAt, "已取貨"]])("list derives fulfillment %s %s", async (status, pickedUpAt, label) => {
 boundary.listAdminOrders.mockResolvedValue({ ok: true, value: [{ ...listOrder, status, pickedUpAt }] });
 render(await AdminOrdersPage());
 expect(screen.getByText(label as string, { exact: true })).toBeVisible();
});

test.each([
  [null, null, true, true, true],
  [createdAt, null, false, true, false],
  [null, createdAt, true, false, false],
  [createdAt, createdAt, false, false, false],
] as const)("payment/pickup controls for paid=%s picked=%s", async (paidAt, pickedUpAt, payment, pickup, cancel) => {
  boundary.getAdminOrderByPublicCode.mockResolvedValue({ ok: true, value: {
    ...detailOrder, status: "PLACED", cancelledAt: null, paidAt, pickedUpAt,
    canMarkPickedUp: pickup, canAdminCancel: cancel,
    pickupBlockReason: pickup ? null : "PICKED_UP", adminCancellationBlockReason: cancel ? null : paidAt ? "PAID" : "PICKED_UP",
  } });
  render(await AdminOrderDetailPage({ params: Promise.resolve({ publicCode }), searchParams: Promise.resolve({}) }));
  expect(screen.queryByRole("button", { name: "確認已收款" }) !== null).toBe(payment);
  expect(screen.queryByRole("button", { name: "標記已取貨" }) !== null).toBe(pickup);
  expect(screen.queryByRole("button", { name: "取消訂單" }) !== null).toBe(cancel);
  expect(screen.getByText(paidAt ? "付款：已收款" : "付款：尚未確認收款")).toBeVisible();
  if (payment) expect(screen.getByText("應收總額：$300")).toBeVisible();
  if (paidAt) expect(screen.getByText(/^收款確認時間：/)).toHaveTextContent("2026/09/14 12:00");
});

test("cancelled Admin order is not presented as an unpaid active order", async () => {
  render(await AdminOrderDetailPage({ params: Promise.resolve({ publicCode }), searchParams: Promise.resolve({}) }));
  expect(screen.queryByText("付款：尚未確認收款")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "確認已收款" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "標記已取貨" })).not.toBeInTheDocument();
});

test("Admin list shows payment separately from pending pickup", async () => {
  boundary.listAdminOrders.mockResolvedValue({ ok: true, value: [{ ...listOrder, status: "PLACED", cancelledAt: null, paidAt: createdAt }] });
  render(await AdminOrdersPage());
  expect(screen.getByText("付款：已收款")).toBeVisible();
  expect(screen.getByText("待取貨")).toBeVisible();
});

const historyRow = {
  state: "CREATED", isCurrent: true, provider: "SEVEN_ELEVEN_MYSHIP",
  trackingNumber: "TRACK-" + "x".repeat(122), recipientName: "歷史收件人", recipientPhone: "0912345678",
  sevenElevenStoreId: "123456", sevenElevenStoreName: "歷史門市", sevenElevenStoreAddress: "長地址".repeat(60),
  createdAt, shippedAt: null, arrivedAt: null, returnedAt: null, voidedAt: null,
};
const requiredOrder = {
  ...detailOrder, status: "PLACED", cancelledAt: null, fulfillmentMethod: "SEVEN_ELEVEN",
  pickupName: null, pickupAddress: null, pickupStartAt: null, pickupEndAt: null,
  sevenElevenStoreId: "123456", sevenElevenStoreName: "目前門市", sevenElevenStoreAddress: "目前地址",
  shipmentRequired: true, canMarkPickedUp: false, pickupBlockReason: "SHIPMENT_NOT_ARRIVED",
  canAdminCancel: true, adminCancellationBlockReason: null,
};
test.each([
  ["before", [], false, "BEFORE_CUTOFF", [], false, true, null],
  ["after", [], true, null, [], false, true, null],
  ["CREATED", [historyRow], false, "ACTIVE_SHIPMENT", ["SHIP", "VOID"], false, false, "CREATED_SHIPMENT"],
  ["SHIPPED", [{ ...historyRow, state: "SHIPPED", shippedAt: createdAt }], false, "ACTIVE_SHIPMENT", ["ARRIVE", "RETURN"], false, false, "ACTIVE_SHIPMENT"],
  ["ARRIVED", [{ ...historyRow, state: "ARRIVED", shippedAt: createdAt, arrivedAt: createdAt }], false, "ACTIVE_SHIPMENT", ["RETURN"], true, false, "ACTIVE_SHIPMENT"],
  ["VOIDED", [{ ...historyRow, state: "VOIDED", isCurrent: false, voidedAt: createdAt }], true, null, [], false, true, null],
  ["RETURNED", [{ ...historyRow, state: "RETURNED", isCurrent: false, shippedAt: createdAt, returnedAt: createdAt }], true, null, [], false, false, "RETURNED_HISTORY"],
  ["replacement", [{ ...historyRow, state: "RETURNED", isCurrent: false, trackingNumber: "OLD", shippedAt: createdAt, returnedAt: createdAt }, historyRow], false, "ACTIVE_SHIPMENT", ["SHIP", "VOID"], false, false, "RETURNED_HISTORY"],
  ["PICKED_UP", [{ ...historyRow, state: "PICKED_UP", shippedAt: createdAt, arrivedAt: createdAt }], false, "PICKED_UP", [], false, false, "PICKED_UP"],
  ["CANCELLED", [{ ...historyRow, state: "VOIDED", isCurrent: false, voidedAt: createdAt }], false, "CANCELLED", [], false, false, "CANCELLED"],
] as const)("Admin shipment UI matrix %s", async (label, shipmentHistory, create, creationReason, actions, pickup, cancel, cancelReason) => {
  boundary.getAdminOrderByPublicCode.mockResolvedValue({ ok: true, value: {
    ...requiredOrder, shipmentHistory, canCreateShipment: create, shipmentCreationBlockReason: creationReason,
    activeShipmentId: actions.length ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null,
    allowedShipmentActions: actions, canMarkPickedUp: pickup, pickupBlockReason: pickup ? null : "SHIPMENT_NOT_ARRIVED",
    canAdminCancel: cancel, adminCancellationBlockReason: cancelReason,
    pickedUpAt: label === "PICKED_UP" ? createdAt : null,
    status: label === "CANCELLED" ? "CANCELLED" : "PLACED",
    cancelledAt: label === "CANCELLED" ? createdAt : null,
  } });
  render(await AdminOrderDetailPage({ params: Promise.resolve({ publicCode }), searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { name: "物流紀錄" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "登錄物流紀錄" }) !== null).toBe(create);
  expect(screen.queryByRole("button", { name: "標記已取貨" }) !== null).toBe(pickup);
  expect(screen.queryByRole("button", { name: "取消訂單" }) !== null).toBe(cancel);
  for (const [operation, name] of [["SHIP", "標記已寄出"], ["ARRIVE", "標記已到店"], ["RETURN", "標記已退回"], ["VOID", "作廢物流"]]) {
    expect(screen.queryByRole("button", { name }) !== null).toBe((actions as readonly string[]).includes(operation));
  }
  if (label === "before") expect(screen.getByText(/團購截止後才能建立物流紀錄/)).toBeVisible();
  if (create) {
    expect(screen.getByRole("textbox", { name: "物流編號" })).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  }
  if (shipmentHistory.length) {
    expect(screen.getByRole("list", { name: "物流歷史紀錄" })).toBeVisible();
    expect(screen.getAllByText(historyRow.sevenElevenStoreAddress)[0]).toHaveClass("break-all");
    if (label !== "CANCELLED") expect(screen.getAllByText(historyRow.trackingNumber)[0]).toHaveClass("break-all");
  }
  if (label === "RETURNED" || label === "replacement") expect(screen.getByText(/退回紀錄不會自動回補訂單庫存/)).toBeVisible();
  if (label === "PICKED_UP") expect(screen.getByRole("button", { name: "確認已收款" })).toBeEnabled();
  if (label === "CANCELLED") expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
test.each(["SELF_PICKUP", "SEVEN_ELEVEN"])("legacy %s has no Shipment controls; existing unpaid pickup/cancel available", async (fulfillmentMethod) => {
  boundary.getAdminOrderByPublicCode.mockResolvedValue({ ok: true, value: {
    ...detailOrder, status: "PLACED", cancelledAt: null, fulfillmentMethod,
    canMarkPickedUp: true, pickupBlockReason: null, canAdminCancel: true, adminCancellationBlockReason: null,
    ...(fulfillmentMethod === "SEVEN_ELEVEN" ? { pickupName: null, pickupAddress: null, sevenElevenStoreName: "門市", sevenElevenStoreId: "123456", sevenElevenStoreAddress: "地址" } : {}),
  } });
  render(await AdminOrderDetailPage({ params: Promise.resolve({ publicCode }), searchParams: Promise.resolve({}) }));
  expect(screen.queryByRole("heading", { name: "物流紀錄" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "登錄物流紀錄" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "標記已取貨" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "取消訂單" })).toBeEnabled();
  expect(screen.queryByText("此訂單沿用原有取貨流程，不需建立物流紀錄。") !== null).toBe(fulfillmentMethod === "SEVEN_ELEVEN");
});
