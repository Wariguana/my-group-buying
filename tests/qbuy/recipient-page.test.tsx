import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const boundary = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.auth }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ lineRecipient: { findMany: boundary.find } }) }));
vi.mock("@/components/qbuy/form", () => ({ QbuyForm: ({ label, base }: { label: string; base: { id?: string } }) => <button data-recipient-id={base.id}>{label}</button> }));
import Page from "@/app/admin/(protected)/qbuy/notifications/page";
import { parseRecipientPage } from "@/lib/qbuy/recipient-query";
beforeEach(() => { vi.resetAllMocks(); boundary.auth.mockResolvedValue({ id: "admin" }); });
afterEach(cleanup);
test.each([undefined, ["2", "3"], "0", "-1", "1.5", "Infinity", "10000"])("invalid or ambiguous page %s returns to first page", value => { expect(parseRecipientPage(value)).toBe(1); });
test("page two exposes older enabled recipients for management, with stable ordering and a next-page lookahead", async () => {
  boundary.find.mockResolvedValue([{ id: "older-recipient", customerAccountId: "older-customer", adminId: null, enabled: true }]);
  render(await Page({ searchParams: Promise.resolve({ page: "2" }) }));
  expect(boundary.find).toHaveBeenCalledWith({ skip: 50, take: 51, orderBy: [{ verifiedAt: "desc" }, { id: "desc" }], select: { id: true, customerAccountId: true, adminId: true, enabled: true } });
  fireOpen();
  expect(screen.getByRole("button", { name: "停用此通知對象" })).toHaveAttribute("data-recipient-id", "older-recipient");
  expect(screen.getByRole("link", { name: "上一頁" })).toHaveAttribute("href", "/admin/qbuy/notifications?page=1");
  expect(screen.queryByRole("link", { name: "下一頁" })).not.toBeInTheDocument();
});
function fireOpen() { screen.getByText("進階設定：LINE 通知對象核實").closest("details")!.open = true; }
test("a 51st result exposes the next page instead of silently losing older recipients", async () => {
  boundary.find.mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({ id: `r-${index}`, customerAccountId: `c-${index}`, adminId: null, enabled: false })));
  render(await Page({ searchParams: Promise.resolve({}) })); fireOpen();
  expect(screen.getByRole("link", { name: "下一頁" })).toHaveAttribute("href", "/admin/qbuy/notifications?page=2");
  expect(screen.queryByText(/對象 c-50 ·/)).not.toBeInTheDocument();
});
test("authentication failure prevents all recipient reads", async () => {
  boundary.auth.mockRejectedValue(new Error("unauthorized"));
  await expect(Page({ searchParams: Promise.resolve({ page: "2" }) })).rejects.toThrow("unauthorized");
  expect(boundary.find).not.toHaveBeenCalled();
});
