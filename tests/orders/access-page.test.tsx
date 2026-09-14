import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  cookies: vi.fn(),
  getOrderForAccess: vi.fn(),
  accessForm: vi.fn(({ publicCode }: { publicCode: string }) => (
    <div data-testid="access-form">access {publicCode}</div>
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
  totalAmount: 300,
  createdAt: new Date("2026-09-14T04:00:00.000Z"),
  cancelledAt: null,
  items: [{ productName: "歷史商品", unit: "袋", unitPrice: 150, quantity: 2, lineSubtotal: 300 }],
};

async function renderPage() {
  const element = await CustomerOrderPage({ params: Promise.resolve({ publicCode }) });
  render(element);
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: token })) });
});
afterEach(cleanup);

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
