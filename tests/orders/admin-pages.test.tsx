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
