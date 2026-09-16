import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { GroupBuyGallery } from "@/app/group-buys/[slug]/group-buy-gallery";

const images = [
  { id: "1", imageUrl: "https://example.com/1.webp", sortOrder: 0 },
  { id: "2", imageUrl: "https://example.com/2.webp", sortOrder: 1 },
  { id: "3", imageUrl: "https://example.com/3.webp", sortOrder: 2 },
];

afterEach(cleanup);

test("zero images renders the neutral placeholder", () => {
  render(<GroupBuyGallery title="蘋果團購" images={[]} />);
  expect(screen.getByTestId("group-buy-gallery-placeholder")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("one image starts deterministically at the first image without pointless controls", () => {
  render(<GroupBuyGallery title="蘋果團購" images={[images[0]]} />);
  expect(screen.getByRole("img", { name: "蘋果團購 圖片 1" })).toHaveAttribute("src", images[0].imageUrl);
  expect(screen.queryByRole("button", { name: "下一張圖片" })).not.toBeInTheDocument();
  expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
});

test("next, previous, thumbnail selection, and counter follow the selected image", () => {
  render(<GroupBuyGallery title="蘋果團購" images={images} />);
  expect(screen.getByText("1 / 3")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "下一張圖片" }));
  expect(screen.getByRole("img", { name: "蘋果團購 圖片 2" })).toHaveAttribute("src", images[1].imageUrl);
  expect(screen.getByText("2 / 3")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "上一張圖片" }));
  expect(screen.getByRole("img", { name: "蘋果團購 圖片 1" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "顯示蘋果團購圖片 3" }));
  expect(screen.getByRole("img", { name: "蘋果團購 圖片 3" })).toBeVisible();
});

test("Left and Right Arrow keys navigate when the gallery is focused", () => {
  render(<GroupBuyGallery title="蘋果團購" images={images} />);
  const gallery = screen.getByRole("region", { name: "蘋果團購商品圖片" });
  gallery.focus();
  fireEvent.keyDown(gallery, { key: "ArrowRight" });
  expect(screen.getByRole("img", { name: "蘋果團購 圖片 2" })).toBeVisible();
  fireEvent.keyDown(gallery, { key: "ArrowLeft" });
  expect(screen.getByRole("img", { name: "蘋果團購 圖片 1" })).toBeVisible();
});

test("horizontal-dominant swipe navigates while vertical or short gestures do not", () => {
  render(<GroupBuyGallery title="蘋果團購" images={images} />);
  const gallery = screen.getByRole("region", { name: "蘋果團購商品圖片" });
  fireEvent.pointerDown(gallery, { clientX: 200, clientY: 100 });
  fireEvent.pointerUp(gallery, { clientX: 120, clientY: 110 });
  expect(screen.getByRole("img", { name: "蘋果團購 圖片 2" })).toBeVisible();
  fireEvent.pointerDown(gallery, { clientX: 120, clientY: 100 });
  fireEvent.pointerUp(gallery, { clientX: 100, clientY: 180 });
  expect(screen.getByRole("img", { name: "蘋果團購 圖片 2" })).toBeVisible();
});
