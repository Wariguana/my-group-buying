import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  getDetail: vi.fn(),
  orderForm: vi.fn(() => <div data-testid="order-form">order form</div>),
}));

vi.mock("@/lib/group-buys/public-service", () => ({
  getPublicGroupBuyBySlug: boundary.getDetail,
}));
vi.mock("@/app/group-buys/[slug]/order-form", () => ({
  PublicOrderForm: boundary.orderForm,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import PublicGroupBuyDetailPage from "@/app/group-buys/[slug]/page";

function detail(lifecycle: "active" | "scheduled" | "ended", options: {
  items?: readonly unknown[];
  pickups?: readonly unknown[];
} = {}) {
  return {
    ok: true,
    value: {
      slug: "gb-AbCdEf0123_-xyZ9",
      title: "公開團購",
      description: null,
      coverImageUrl: null,
      startAt: new Date("2026-09-14T01:00:00.000Z"),
      endAt: new Date("2026-09-15T01:00:00.000Z"),
      lifecycle,
      items: options.items ?? [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        salePrice: 120,
        stock: 5,
        purchaseLimit: null,
        sortOrder: 0,
        product: { name: "蘋果", unit: "箱" },
      }],
      pickups: options.pickups ?? [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        pickupStartAt: null,
        pickupEndAt: null,
        sortOrder: 0,
        pickupLocation: { name: "中正取貨點", address: "台北市" },
      }],
    },
  };
}

async function renderPage() {
  const element = await PublicGroupBuyDetailPage({
    params: Promise.resolve({ slug: "gb-AbCdEf0123_-xyZ9" }),
    searchParams: Promise.resolve({}),
  });
  render(element);
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

test("active Group Buy with items and pickups renders the order form", async () => {
  boundary.getDetail.mockResolvedValue(detail("active"));
  await renderPage();
  expect(screen.getByTestId("order-form")).toBeVisible();
});

test("scheduled Group Buy explains ordering is unavailable and hides the form", async () => {
  boundary.getDetail.mockResolvedValue(detail("scheduled"));
  await renderPage();
  expect(screen.getByText("目前尚未開放訂購。")).toBeVisible();
  expect(screen.queryByTestId("order-form")).not.toBeInTheDocument();
});

test("ended Group Buy explains ordering has ended and hides the form", async () => {
  boundary.getDetail.mockResolvedValue(detail("ended"));
  await renderPage();
  expect(screen.getByText("團購已結束。")).toBeVisible();
  expect(screen.queryByTestId("order-form")).not.toBeInTheDocument();
});

test.each([
  ["items", { items: [] }],
  ["pickups", { pickups: [] }],
] as const)("active Group Buy without %s cannot render a submit form", async (_label, options) => {
  boundary.getDetail.mockResolvedValue(detail("active", options));
  await renderPage();
  expect(screen.queryByTestId("order-form")).not.toBeInTheDocument();
});
