import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminDashboard: vi.fn(),
  getAdminWorkspace: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.requireAdmin }));
vi.mock("@/lib/admin/dashboard-service", () => ({
  getAdminDashboard: boundary.getAdminDashboard,
}));
vi.mock("@/lib/admin/workspace", () => ({ getAdminWorkspace: boundary.getAdminWorkspace }));

import AdminPage from "@/app/admin/(protected)/page";

const dashboard = {
  activeGroupBuyCount: 2,
  unpaidOrderCount: 3,
  awaitingPickupCount: 4,
  todayOrderCount: 5,
  recentOrders: [{
    publicCode: "ord-AbCdEf0123_-xyZ9",
    status: "PLACED" as const,
    customerName: "王小明",
    totalAmount: 680,
    createdAt: new Date("2026-09-15T02:18:00.000Z"),
    paidAt: null,
    pickedUpAt: null,
    groupBuy: { title: "秋季團購" },
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.requireAdmin.mockResolvedValue({ id: "admin-id", email: "admin@example.com" });
  boundary.getAdminDashboard.mockResolvedValue({ ok: true, value: dashboard });
  boundary.getAdminWorkspace.mockResolvedValue({ work: [{ label: "待核帳", count: 14, href: "/admin/payments" }], todayOrderCount: 8, recentOrders: [{ orderNumber: "QB202610290001", status: "PAID", totalAmount: 680, createdAt: new Date(), checkout: { customerName: "新制顧客" } }] });
});

afterEach(cleanup);

test("Admin dashboard renders counts, pending work, and recent orders", async () => {
  render(await AdminPage());

  expect(boundary.requireAdmin).toHaveBeenCalledTimes(1);
  expect(boundary.getAdminDashboard).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", { name: "營運首頁" })).toBeVisible();
  expect(screen.getByText("從待處理工作開始，掌握 QB 訂單與舊制訂單的營運狀況。")).toBeVisible();
  expect(screen.getByRole("link", { name: "新增團購" })).toHaveAttribute("href", "/admin/group-buys/new");
  expect(screen.getByText("進行中團購").parentElement).toHaveTextContent("2");
  expect(screen.getAllByText("待核帳")).toHaveLength(1);
  expect(screen.getByRole("link", { name: /待核帳\s*14 筆/ })).toHaveAttribute("href", "/admin/payments");
  expect(screen.getByText("今日新增舊制訂單").parentElement).toHaveTextContent("5");
  expect(screen.getByText("今日新增 QB 訂單").parentElement).toHaveTextContent("8");
  expect(screen.getByRole("link", { name: "查看訂單" })).toHaveAttribute("href", "/admin/qbuy?queue=all&q=QB202610290001");
  expect(screen.getByRole("heading", { name: "待處理事項" })).toBeVisible();

  const legacy = screen.getByText("舊制訂單待辦與最近紀錄").parentElement!;
  legacy.setAttribute("open", "");
  const row = screen.getAllByRole("row")[1];
  expect(within(row).getByText("ord-AbCdEf0123_-xyZ9")).toBeVisible();
  expect(row).toHaveTextContent("王小明");
  expect(row).toHaveTextContent("秋季團購");
  expect(row).toHaveTextContent("$680");
  expect(row).toHaveTextContent("尚未確認收款");
  expect(row).toHaveTextContent("待取貨");
  expect(row).toHaveTextContent("2026/09/15 10:18");
  expect(screen.queryByText("管理員帳號")).not.toBeInTheDocument();
  expect(screen.queryByText("admin@example.com")).not.toBeInTheDocument();
});

test("Admin dashboard renders zero-data empty states", async () => {
  boundary.getAdminWorkspace.mockResolvedValue({ work: [], todayOrderCount: 0, recentOrders: [] });
  boundary.getAdminDashboard.mockResolvedValue({
    ok: true,
    value: {
      activeGroupBuyCount: 0,
      unpaidOrderCount: 0,
      awaitingPickupCount: 0,
      todayOrderCount: 0,
      recentOrders: [],
    },
  });

  render(await AdminPage());

  expect(screen.getByText("目前沒有需要處理的事項。")).toBeVisible();
  expect(screen.getByText("目前尚無 QB 訂單。")).toBeVisible();
  expect(screen.getByText("目前尚無訂單資料。")).toBeInTheDocument();
});

test("QB read failure cannot appear as no pending work", async () => {
  boundary.getAdminWorkspace.mockRejectedValue(new Error("private database error"));
  render(await AdminPage());
  expect(screen.getByRole("alert")).toHaveTextContent("QB 工作資料讀取失敗");
  expect(screen.queryByText("目前沒有需要處理的事項。")).not.toBeInTheDocument();
  expect(screen.getByText("今日新增 QB 訂單").parentElement).toHaveTextContent("讀取失敗");
});
