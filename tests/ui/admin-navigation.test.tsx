import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
const location = vi.hoisted(() => ({ path: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.path }));
import { AdminNav } from "@/components/admin/admin-nav";
afterEach(cleanup);

test("grouped navigation retains every destination and opens bank/shipping settings directly", () => {
  render(<AdminNav />);
  const toggle = screen.getByRole("button", { name: "開啟管理選單" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const nav = screen.getByRole("navigation");
  expect(within(nav).getAllByRole("link")).toHaveLength(11);
  expect(within(nav).getAllByRole("link")[0]).toHaveTextContent("營運首頁");
  expect(within(nav).getAllByRole("link").at(-1)).toHaveTextContent("平台監控");
  expect(within(nav).getByRole("link", { name: "舊制訂單管理" })).toHaveAttribute("href", "/admin/orders");
  const settings = within(nav).getByRole("link", { name: "銀行與配送設定" });
  expect(settings).toHaveAttribute("href", "/admin/payments?settings=1#settings");
  settings.addEventListener("click", event => event.preventDefault());
  fireEvent.click(settings);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("inventory detail belongs to SKU navigation and has one active destination", () => {
  location.path = "/admin/inventory/sku-id";
  const { container } = render(<AdminNav />);
  expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(container.querySelector('[aria-current="page"]')).toHaveTextContent("SKU／分類／庫存");
  location.path = "/admin";
});
