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

import AdminOrdersPage from "@/app/admin/(protected)/orders/page";
import AdminOrderDetailPage from "@/app/admin/(protected)/orders/[publicCode]/page";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const createdAt = new Date("2026-09-14T04:00:00.000Z");
const cancelledAt = new Date("2026-09-14T04:30:00.000Z");
const listOrder = {
  publicCode,
  status: "CANCELLED" as const,
  customerName: "歷史姓名",
  customerPhone: "+886912345678",
  totalAmount: 300,
  createdAt,
  cancelledAt,
  groupBuy: { title: "秋季團購" },
};
const detailOrder = {
  publicCode,
  status: "CANCELLED" as const,
  customerName: "歷史姓名",
  customerPhone: "+886912345678",
  pickupName: "歷史取貨點",
  pickupAddress: "歷史取貨地址",
  pickupStartAt: new Date("2026-09-15T01:00:00.000Z"),
  pickupEndAt: new Date("2026-09-15T03:00:00.000Z"),
  totalAmount: 300,
  createdAt,
  cancelledAt,
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
  const row = screen.getByRole("listitem");
  expect(row).toHaveTextContent(publicCode);
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
  expect(screen.getByRole("heading", { name: publicCode })).toBeVisible();
  expect(screen.getByText("歷史姓名")).toBeVisible();
  expect(screen.getByText("歷史取貨點")).toBeVisible();
  expect(screen.getByText("歷史取貨地址")).toBeVisible();
  expect(screen.getByText("歷史商品")).toBeVisible();
  expect(screen.getByText(/× 2/)).toBeVisible();
  expect(screen.getByText("CANCELLED")).toBeVisible();
  expect(screen.getByText("取消時間").parentElement).toHaveTextContent("2026/09/14 12:30");
  expect(screen.getByText(/訂單總額/)).toHaveTextContent("$300");
  expect(screen.queryByRole("button", { name: "取消訂單" })).not.toBeInTheDocument();
});

test("PLACED detail shows Admin cancellation even after cutoff", async () => {
  boundary.getAdminOrderByPublicCode.mockResolvedValue({ ok: true, value: {
    ...detailOrder, status: "PLACED", cancelledAt: null,
    groupBuy: { ...detailOrder.groupBuy, endAt: new Date("2000-01-01T00:00:00Z") },
  } });
  render(await AdminOrderDetailPage({ params: Promise.resolve({ publicCode }), searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("button", { name: "取消訂單" })).toBeEnabled();
});
