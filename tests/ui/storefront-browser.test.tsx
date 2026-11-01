import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const routing = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routing }));
vi.mock("next/link", () => ({ default: ({ href, onNavigate, children, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string; scroll?: boolean; onNavigate?: (event: { preventDefault: () => void }) => void; children: ReactNode }) => {
  delete props.scroll;
  return <a {...props} href={href} onClick={event => { event.preventDefault(); onNavigate?.({ preventDefault: () => undefined }); }}>{children}</a>;
} }));
import { StorefrontBrowser } from "@/app/storefront-browser";

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); routing.push.mockClear(); });
const categories = [{ id: "food", name: "食品" }, { id: "drink", name: "飲料" }];

test("category navigation retains search and legacy ordering and requests no document scroll", () => {
  render(<StorefrontBrowser query={{ q: "咖啡", view: "featured" }} categories={categories}><p>原結果</p></StorefrontBrowser>);
  const food = screen.getByRole("link", { name: "食品" });
  expect(food).toHaveAttribute("href", "/?q=%E5%92%96%E5%95%A1&view=featured&category=food");
  fireEvent.click(food);
  expect(routing.push).toHaveBeenCalledExactlyOnceWith("/?q=%E5%92%96%E5%95%A1&view=featured&category=food", { scroll: false });
  expect(screen.getByText("原結果")).toBeVisible();
});

test("clicking the selected category does not start a duplicate navigation", () => {
  render(<StorefrontBrowser query={{ category: "food" }} categories={categories}><p>食品結果</p></StorefrontBrowser>);
  fireEvent.click(screen.getByRole("link", { name: "食品" }));
  expect(routing.push).not.toHaveBeenCalled();
});

test("a clipped chip scrolls only its own row and respects reduced motion", () => {
  render(<StorefrontBrowser query={{}} categories={categories}><p>原結果</p></StorefrontBrowser>);
  const nav = screen.getByRole("navigation", { name: "商品分類" }), food = screen.getByRole("link", { name: "食品" });
  Object.defineProperties(nav, { scrollWidth: { value: 500 }, clientWidth: { value: 180 } });
  vi.spyOn(nav, "getBoundingClientRect").mockReturnValue({ left: 0, right: 180 } as DOMRect);
  vi.spyOn(food, "getBoundingClientRect").mockReturnValue({ left: 160, right: 224 } as DOMRect);
  const scroll = vi.fn(); Object.defineProperty(nav, "scrollBy", { value: scroll });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  fireEvent.click(food);
  expect(scroll).toHaveBeenCalledWith({ left: 50, behavior: "instant" });
});

test("one decorative marker follows the committed selection without remounting the row", () => {
  const { container, rerender } = render(<StorefrontBrowser query={{}} categories={categories}><p>全部結果</p></StorefrontBrowser>);
  const nav = screen.getByRole("navigation", { name: "商品分類" }), food = screen.getByRole("link", { name: "食品" });
  Object.defineProperties(food, { offsetLeft: { value: 80 }, offsetWidth: { value: 72 } });
  const marker = container.querySelector(".qbuy-category-marker");
  rerender(<StorefrontBrowser query={{ category: "food" }} categories={categories}><p>食品結果</p></StorefrontBrowser>);
  expect(container.querySelectorAll(".qbuy-category-marker")).toHaveLength(1);
  expect(container.querySelector(".qbuy-category-marker")).toBe(marker);
  expect(marker).toHaveAttribute("aria-hidden", "true");
  expect(marker).toHaveStyle({ transform: "translate3d(104px, 0, 0)" });
  expect(screen.getByRole("navigation", { name: "商品分類" })).toBe(nav);
});
