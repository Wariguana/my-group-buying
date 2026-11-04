// @vitest-environment node
import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseOrderFilters, orderListUrl } from "@/lib/admin/orders";
test("untrusted duplicate search parameters and unknown states safely normalize", () => {
  expect(parseOrderFilters({ q: ["a", "b"], page: "-2", status: "__proto__", queue: "constructor" })).toMatchObject({ q: "", page: 1, status: "", queue: "all" });
  expect(parseOrderFilters({ view: "orders", page: "2.8", status: "PAID", today: "1" })).toMatchObject({ view: "orders", page: 2, status: "PAID", today: true });
  expect(parseOrderFilters({ page: "Infinity" }).page).toBe(10000);
});
test("pagination keeps search, status, work queue and date; switching views resets incompatible state", () => {
  const filters = parseOrderFilters({ q: "顧客 A", queue: "refund", status: "FINALIZED", today: "1" });
  const p = new URL(orderListUrl(filters, { page: 3 }), "http://localhost").searchParams;
  expect(Object.fromEntries(p)).toEqual({ view: "purchases", q: "顧客 A", status: "FINALIZED", queue: "refund", today: "1", page: "3" });
  const next = new URL(orderListUrl(filters, { view: "orders", status: "", page: 1 }), "http://localhost");
  expect(next.searchParams.get("q")).toBe("顧客 A"); expect(next.searchParams.get("queue")).toBeNull(); expect(next.searchParams.get("status")).toBeNull();
});
