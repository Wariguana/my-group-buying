import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const boundary = vi.hoisted(() => ({
  getDetail: vi.fn(),
  getSelection: vi.fn(),
  cookies: vi.fn(),
  orderForm: vi.fn(() => <div data-testid="order-form">order form</div>),
}));

vi.mock("@/lib/group-buys/public-service", () => ({
  getPublicGroupBuyBySlug: boundary.getDetail,
}));
vi.mock("@/lib/logistics/store-selection", () => ({
  getSevenElevenStoreSelectionForPage: boundary.getSelection,
}));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("@/app/group-buys/[slug]/order-form", () => ({
  PublicOrderForm: boundary.orderForm,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import PublicGroupBuyDetailPage from "@/app/group-buys/[slug]/page";

function detail(lifecycle: "active" | "scheduled" | "ended", options: {
  items?: readonly unknown[];
  pickups?: readonly unknown[];
  images?: { id: string; imageUrl: string; sortOrder: number }[];
} = {}) {
  return {
    ok: true,
    value: {
      slug: "gb-AbCdEf0123_-xyZ9",
      title: "公開團購",
      description: null,
      images: options.images ?? [],
      startAt: new Date("2026-09-14T01:00:00.000Z"),
      endAt: new Date("2026-09-15T01:00:00.000Z"),
      lifecycle,
      allowsSelfPickup: true,
      allowsSevenEleven: false,
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

beforeEach(() => {
  vi.resetAllMocks();
  boundary.cookies.mockResolvedValue({ get: vi.fn() });
});
afterEach(cleanup);

test("active Group Buy with items and pickups renders the order form", async () => {
  boundary.getDetail.mockResolvedValue(detail("active"));
  await renderPage();
  expect(screen.getByTestId("order-form")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "團購商品" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "取貨方式" })).not.toBeInTheDocument();
});

test("gallery and essential information use a responsive desktop hero above the order form", async () => {
  boundary.getDetail.mockResolvedValue(detail("active", { images: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", imageUrl: "https://example.com/cover.jpg", sortOrder: 0 }] }));
  await renderPage();

  expect(screen.getByTestId("group-buy-hero")).toHaveClass("lg:grid");
  expect(screen.getByTestId("group-buy-gallery")).toContainElement(screen.getByRole("img", { name: "公開團購 圖片 1" }));
  expect(screen.getByRole("img", { name: "公開團購 圖片 1" })).toHaveClass("object-contain");
  expect(screen.getByTestId("group-buy-overview")).toContainElement(screen.getByTestId("group-buy-title"));
  expect(screen.getByTestId("group-buy-overview")).toContainElement(screen.getByTestId("ordering-period"));
  expect(screen.getByTestId("order-form")).not.toBeNull();
});

test("scheduled Group Buy explains ordering is unavailable and hides the form", async () => {
  boundary.getDetail.mockResolvedValue(detail("scheduled"));
  await renderPage();
  expect(screen.getByText("目前尚未開放訂購。")).toBeVisible();
  expect(screen.getByRole("heading", { name: "團購商品" })).toBeVisible();
  expect(screen.getAllByText("指定地點自取")[0]).toBeVisible();
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
