// @vitest-environment node
import { expect, test } from "vitest";
import { adminNavigation, getAdminDestination, getMobileDestination, mobileNavigation } from "../../src/components/admin/navigation";

test.each([
  ["/admin", "overview", "overview"],
  ["/admin/qbuy", "purchases", "orders"],
  ["/admin/qbuy?view=purchases&status=REPORTED&page=2", "purchases", "orders"],
  ["/admin/qbuy?view=orders&q=合成", "orders", "orders"],
  ["/admin/qbuy?view=orders&view=purchases", "purchases", "orders"],
  ["/admin/qbuy/checkout-id#payment", "purchases", "orders"],
  ["/admin/qbuy/notifications", "notifications", "more"],
  ["/admin/orders", "more", "more"],
  ["/admin/orders/legacy-code", "more", "more"],
  ["/admin/products", "products", "products"],
  ["/admin/products/new", "products", "products"],
  ["/admin/products/product-id/edit", "products", "products"],
  ["/admin/group-buys/new", "group-buys", "more"],
  ["/admin/group-buys/group-id/edit", "group-buys", "more"],
  ["/admin/commerce", "commerce", "more"],
  ["/admin/inventory/sku-id", "commerce", "more"],
  ["/admin/suppliers/new", "suppliers", "more"],
  ["/admin/suppliers/supplier-id/edit", "suppliers", "more"],
  ["/admin/pickup-locations/location-id/edit", "pickup-locations", "more"],
  ["/admin/payments", "payments", "more"],
  ["/admin/payments?settings=1#settings", "settings", "more"],
  ["/admin/payments#settings", "settings", "more"],
  ["/admin/payments?settings=0", "payments", "more"],
  ["/admin/payments?settings=1&settings=0", "payments", "more"],
  ["/admin/operations", "operations", "more"],
  ["/admin/more#account", "more", "more"],
  ["/admin/products-unrelated", "more", "more"],
])("selected navigation for %s", (path, expected, mobile) => {
  const url = new URL(path, "https://example.invalid");
  const destination = getAdminDestination(url.pathname, url.searchParams, url.hash);
  expect(destination).toBe(expected);
  expect(getMobileDestination(destination)).toBe(mobile);
});

test("More preserves secondary destinations without duplicating the three primary entries", () => {
  expect(mobileNavigation.map(link => link.label)).toEqual(["總覽", "訂單", "商品", "更多"]);
  const secondary = adminNavigation.flatMap(group => group.links).filter(link => !link.primary);
  expect(secondary.map(link => link.href)).toEqual([
    "/admin/qbuy?view=orders", "/admin/payments", "/admin/group-buys", "/admin/commerce", "/admin/suppliers",
    "/admin/pickup-locations", "/admin/payments?settings=1#settings", "/admin/qbuy/notifications", "/admin/operations",
  ]);
  expect(new Set(secondary.map(link => link.id)).size).toBe(secondary.length);
});
