import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminWorkspace: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.requireAdmin }));
vi.mock("@/lib/admin/workspace", () => ({ getAdminWorkspace: boundary.getAdminWorkspace }));

import AdminPage from "@/app/admin/(protected)/page";

const sample = {
  activeGroupBuys: 2,
  todayPurchases: 4,
  todayOrders: 3,
  shipmentGroups: 1,
  tasks: [
    { key: "reported", label: "等待核對付款", description: "顧客已回報轉帳，請核對銀行實際入帳", count: 2, unit: "筆購買", href: "/admin/qbuy?view=purchases&status=REPORTED", critical: false },
    { key: "refundError", label: "退款異常", description: "需要查核", count: 0, unit: "筆購買", href: "/admin/qbuy?view=purchases&queue=refundError", critical: true },
  ],
  recentOrders: [{
    checkoutId: "checkout-one",
    orderNumber: "QB202611010001",
    status: "PAID",
    totalAmount: 680,
    createdAt: new Date("2026-11-01T02:18:00.000Z"),
    checkout: { customerName: "王小明" },
    groupBuy: { title: "秋季團購" },
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.requireAdmin.mockResolvedValue({ id: "admin-id", email: "admin@example.com" });
  boundary.getAdminWorkspace.mockResolvedValue(sample);
});
afterEach(cleanup);

test("work overview is QB-first and links to exact purchase queues", async () => {
  render(await AdminPage());
  expect(boundary.requireAdmin).toHaveBeenCalledTimes(1);
  expect(boundary.getAdminWorkspace).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", { name: "工作總覽" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "需要處理" })).toBeVisible();
  expect(screen.getByRole("link", { name: /等待核對付款/ })).toHaveAttribute("href", "/admin/qbuy?view=purchases&status=REPORTED");
  expect(screen.getByText("今日收到的購買")).toBeVisible();
  expect(screen.getByText("今日成立的訂單")).toBeVisible();
  expect(screen.getByRole("link", { name: /今日收到的購買/ })).toHaveAttribute("href", "/admin/qbuy?view=purchases&today=1");
  expect(screen.getByRole("link", { name: /今日成立的訂單/ })).toHaveAttribute("href", "/admin/qbuy?view=orders&today=1");
  expect(screen.queryByRole("link", { name: /退款異常/ })).not.toBeInTheDocument();
  expect(screen.getByText("QB202611010001")).toBeVisible();
  expect(screen.getByText(/王小明/)).toBeVisible();
  expect(screen.queryByText("最近舊制訂單")).not.toBeInTheDocument();
});

test("empty state distinguishes no action from no purchases", async () => {
  boundary.getAdminWorkspace.mockResolvedValue({
    ...sample, todayPurchases: 0, todayOrders: 0, tasks: sample.tasks.map((task) => ({ ...task, count: 0 })), recentOrders: [],
  });
  render(await AdminPage());
  expect(screen.getByText("目前沒有需要處理的事項")).toBeVisible();
  expect(screen.getByText("尚未建立正式 QB 訂單")).toBeVisible();
});

test("read failure is never represented as zero", async () => {
  boundary.getAdminWorkspace.mockRejectedValue(new Error("private database error"));
  render(await AdminPage());
  expect(screen.getByRole("alert")).toHaveTextContent("無法載入工作資料");
  expect(screen.getByRole("link", { name: "重試" })).toHaveAttribute("href", "/admin");
  expect(screen.queryByText("目前沒有需要處理的事項")).not.toBeInTheDocument();
});
