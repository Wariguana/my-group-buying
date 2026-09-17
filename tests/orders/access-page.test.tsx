import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  cookies: vi.fn(),
  getOrderForAccess: vi.fn(),
  accessForm: vi.fn(({ publicCode }: { publicCode: string }) => (
    <div data-testid="access-form">access {publicCode}</div>
  )),
  cancelForm: vi.fn(({ publicCode }: { publicCode: string }) => (
    <div data-testid="cancel-form">cancel {publicCode}</div>
  )),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("@/lib/orders/access-service", () => ({
  getOrderForAccess: boundary.getOrderForAccess,
}));
vi.mock("@/app/orders/[publicCode]/access-form", () => ({
  OrderAccessForm: boundary.accessForm,
}));
vi.mock("@/app/orders/[publicCode]/cancel-form", () => ({
  CancelOrderForm: boundary.cancelForm,
}));

import CustomerOrderPage from "@/app/orders/[publicCode]/page";

const publicCode = "ord-AbCdEf0123_-xyZ9";
const token = "A".repeat(43);
const detail = {
  publicCode,
  status: "PLACED" as const,
  customerName: "歷史姓名",
  customerPhone: "+886912345678",
  pickupName: "歷史取貨點",
  pickupAddress: "歷史地址",
  pickupStartAt: new Date("2026-09-15T01:00:00.000Z"),
  pickupEndAt: new Date("2026-09-15T03:00:00.000Z"),
  fulfillmentMethod: "SELF_PICKUP" as const,
  sevenElevenStoreId: null,
  sevenElevenStoreName: null,
  sevenElevenStoreAddress: null,
  totalAmount: 300,
  createdAt: new Date("2026-09-14T04:00:00.000Z"),
  cancelledAt: null, pickedUpAt: null, paidAt: null,
  canCancel: true,
  cancellationDeadline: new Date("2026-09-14T05:00:00.000Z"),
  items: [{ productName: "歷史商品", unit: "袋", unitPrice: 150, quantity: 2, lineSubtotal: 300 }],
};

async function renderPage() {
  const element = await CustomerOrderPage({ params: Promise.resolve({ publicCode }) });
  render(element);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T02:00:00.000Z"));
  boundary.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: token })) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("valid cookie renders the safe snapshot detail", async () => {
  boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: detail });
  await renderPage();
  expect(boundary.getOrderForAccess).toHaveBeenCalledExactlyOnceWith(publicCode, token);
  expect(screen.getByRole("heading", { name: publicCode })).toBeVisible();
  expect(screen.getByText("歷史姓名")).toBeVisible();
  expect(screen.getByText("歷史商品")).toBeVisible();
  expect(screen.getByText(/× 2/)).toBeVisible();
  expect(screen.getAllByText(/\$300/).length).toBeGreaterThan(0);
  expect(screen.getByText("歷史取貨點")).toBeVisible();
  expect(screen.getByText("PLACED")).toBeVisible();
  expect(screen.queryByTestId("access-form")).not.toBeInTheDocument();
  expect(screen.getByText(/可取消訂單/)).toBeVisible();
  expect(screen.getByTestId("cancel-form")).toBeVisible();
});

test("back link keeps navigating to the public group-buy list", async () => {
  boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: detail });
  await renderPage();
  expect(screen.getByRole("link", { name: "返回團購列表" })).toHaveAttribute("href", "/");
});

describe("customer payment presentation", () => {
  test("unpaid order uses collect-on-pickup wording", async () => {
    boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: detail });
    await renderPage();
    const section = screen.getByRole("heading", { name: "收款狀態" }).closest("section");
    expect(section).toHaveTextContent("待收款");
    expect(section).toHaveTextContent("取貨時付款");
    expect(section).not.toHaveTextContent("尚未確認收款");
  });

  test("paid order shows completed collection and its timestamp", async () => {
    boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: { ...detail, paidAt: new Date("2026-09-15T02:00:00Z"), canCancel: false } });
    await renderPage();
    const section = screen.getByRole("heading", { name: "收款狀態" }).closest("section");
    expect(section).toHaveTextContent("已收款");
    expect(section).toHaveTextContent("已完成收款");
    expect(screen.getByText(/^收款確認時間：/)).toHaveTextContent("2026/09/15 10:00");
  });
});

describe("self-pickup window presentation", () => {
  test.each([
    ["before the window", "2026-09-15T00:59:59.000Z", "尚未開始"],
    ["at the start boundary", "2026-09-15T01:00:00.000Z", "取貨期間中"],
    ["within the window", "2026-09-15T02:00:00.000Z", "取貨期間中"],
    ["at the end boundary", "2026-09-15T03:00:00.000Z", "取貨期間中"],
    ["after the window", "2026-09-15T03:00:00.001Z", "已逾取貨期間"],
  ])("%s shows %s", async (_scenario, now, expected) => {
    vi.setSystemTime(new Date(now));
    boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: detail });
    await renderPage();
    expect(screen.getByText(expected)).toBeVisible();
  });

  test("future window does not show the obsolete waiting label", async () => {
    vi.setSystemTime(new Date("2026-09-15T00:59:59.000Z"));
    boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: detail });
    await renderPage();
    expect(screen.getByText("尚未開始")).toBeVisible();
    expect(screen.queryByText("待取貨")).not.toBeInTheDocument();
  });

  test("picked-up order keeps its completed state and timestamp", async () => {
    boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: { ...detail, pickedUpAt: new Date("2026-09-15T01:00:00Z"), canCancel: false } });
    await renderPage();
    expect(screen.getByText("已取貨")).toBeVisible();
    expect(screen.getByText(/^已取貨：/)).toHaveTextContent("09:00");
  });
});

test("PLACED order at or after cutoff hides cancellation form and explains closure", async () => {
  boundary.getOrderForAccess.mockResolvedValue({
    ok: true,
    value: { ...detail, canCancel: false },
  });
  await renderPage();
  expect(screen.queryByTestId("cancel-form")).not.toBeInTheDocument();
  expect(screen.getByText("此團購已截止，訂單無法自行取消。")).toBeVisible();
});

test("CANCELLED order hides cancellation form and shows stored cancellation time", async () => {
  boundary.getOrderForAccess.mockResolvedValue({
    ok: true,
    value: {
      ...detail,
      status: "CANCELLED",
      canCancel: false,
      cancelledAt: new Date("2026-09-14T04:30:00.000Z"),
    },
  });
  await renderPage();
  expect(screen.queryByTestId("cancel-form")).not.toBeInTheDocument();
  expect(screen.getByText("CANCELLED")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("訂單已取消。取消時間：");
});

test.each([
  ["missing cookie", undefined],
  ["wrong cookie", "B".repeat(43)],
] as const)("%s cannot reveal order data and shows the access form", async (_label, rawToken) => {
  boundary.cookies.mockResolvedValue({ get: vi.fn(() => rawToken ? { value: rawToken } : undefined) });
  boundary.getOrderForAccess.mockResolvedValue({ ok: false, message: "generic" });
  await renderPage();
  expect(screen.getByTestId("access-form")).toBeVisible();
  expect(screen.queryByText("歷史姓名")).not.toBeInTheDocument();
  expect(screen.queryByText("歷史商品")).not.toBeInTheDocument();
});


test("picked up customer sees timestamp and explicit refusal without cancel control", async () => {
 boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: { ...detail, pickedUpAt: new Date("2026-09-15T01:00:00Z"), canCancel: false } });
 await renderPage();
 expect(screen.getByText(/^已取貨：/)).toHaveTextContent("09:00");
 expect(screen.getByText("訂單已取貨，無法取消。")).toBeVisible();
 expect(boundary.cancelForm).not.toHaveBeenCalled();
});

test("authorized paid customer sees timestamp and cancellation refusal, without payment action", async () => {
  boundary.getOrderForAccess.mockResolvedValue({ ok: true, value: { ...detail, paidAt: new Date("2026-09-15T02:00:00Z"), canCancel: false } });
  await renderPage();
  expect(screen.getByText("已完成收款")).toBeVisible();
  expect(screen.getByText(/^收款確認時間：/)).toHaveTextContent("2026/09/15 10:00");
  expect(screen.getByText("訂單已確認收款，無法取消。")).toBeVisible();
  expect(boundary.cancelForm).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "確認已收款" })).not.toBeInTheDocument();
});
