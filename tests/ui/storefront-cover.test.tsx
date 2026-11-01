import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { StorefrontCover } from "@/app/storefront-cover";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test("loading and failed uploads keep their reserved image frame", () => {
  const { container } = render(<StorefrontCover url="/local-test-image.png" title="測試團購" />);
  const frame = container.firstElementChild;
  expect(screen.getByText("圖片載入中")).toBeVisible();
  expect(container.querySelector("[data-product-image-placeholder]")).not.toBeInTheDocument();
  const image = screen.getByRole("img", { name: "測試團購封面" });
  expect(image).toHaveClass("object-contain");
  fireEvent.load(image);
  expect(screen.queryByText("圖片載入中")).not.toBeInTheDocument();
  expect(image).toHaveClass("opacity-100");
  fireEvent.error(image);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("圖片暫時無法顯示")).toBeVisible();
  expect(container.firstElementChild).toBe(frame);
  expect(frame).toHaveClass("aspect-square", "sm:aspect-[4/3]");
});

test("missing image has an explicit placeholder without a broken request", () => {
  render(<StorefrontCover url={null} title="無圖團購" />);
  expect(screen.getByText("暫無商品圖片")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("an image already loaded before hydration is displayed without another load event", () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(800);
  render(<StorefrontCover url="/cached-image.webp" title="快取團購" />);
  expect(screen.getByRole("img", { name: "快取團購封面" })).toHaveClass("opacity-100");
  expect(screen.queryByText("圖片載入中")).not.toBeInTheDocument();
});

test("an image that already failed before hydration shows its fallback", () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
  render(<StorefrontCover url="/cached-failure.webp" title="失敗團購" />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("圖片暫時無法顯示")).toBeVisible();
});

test("compact missing covers keep one readable message and decorative, unfocusable artwork", () => {
  const { container } = render(<StorefrontCover url={null} title="縮圖團購" compact fill />);
  expect(screen.getAllByText("暫無商品圖片")).toHaveLength(1);
  expect(screen.getByText("暫無商品圖片")).toHaveClass("sr-only");
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector("svg")).toHaveAttribute("focusable", "false");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
