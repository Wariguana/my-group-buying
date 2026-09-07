// @vitest-environment node
import { randomBytes } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
const boundary = vi.hoisted(() => ({ cookies: vi.fn(), get: vi.fn(), lookup: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));
vi.mock("@/lib/auth/session", () => ({ getAdminBySessionToken: boundary.lookup }));
import { getCurrentAdmin, requireAdmin } from "@/lib/auth/current-admin";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import AdminLoginPage from "@/app/admin/login/page";
import ProtectedAdminLayout from "@/app/admin/(protected)/layout";
const admin = { id: "admin-id", email: "admin@example.com", isActive: true };
const redirectSignal = new Error("test redirect");
let token: string;
beforeEach(() => {
  vi.resetAllMocks();
  token = randomBytes(32).toString("base64url");
  boundary.cookies.mockResolvedValue({ get: boundary.get });
  boundary.get.mockReturnValue({ value: token });
  boundary.lookup.mockResolvedValue(admin);
  boundary.redirect.mockImplementation(() => { throw redirectSignal; });
});
test("awaits cookie store and does not cache authentication between calls", async () => {
  expect(await getCurrentAdmin()).toEqual(admin);
  boundary.lookup.mockResolvedValue(null);
  expect(await getCurrentAdmin()).toBeNull();
  expect(boundary.cookies).toHaveBeenCalledTimes(2);
  expect(boundary.get).toHaveBeenCalledWith(ADMIN_SESSION_COOKIE_NAME);
  expect(boundary.lookup.mock.calls.every(([value]) => value === token)).toBe(true);
});
test("missing cookie is passed safely to lookup", async () => {
  boundary.get.mockReturnValue(undefined);
  boundary.lookup.mockResolvedValue(null);
  expect(await getCurrentAdmin()).toBeNull();
  expect(boundary.lookup).toHaveBeenCalledWith(undefined);
});
test("requireAdmin returns current public admin", async () => {
  expect(await requireAdmin()).toEqual(admin);
  expect(boundary.redirect).not.toHaveBeenCalled();
});
test("protected layout rejects an unauthenticated request", async () => {
  boundary.lookup.mockResolvedValue(null);
  await expect(ProtectedAdminLayout({ children: null })).rejects.toBe(redirectSignal);
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/login");
});
test("login page redirects an already authenticated admin", async () => {
  await expect(AdminLoginPage()).rejects.toBe(redirectSignal);
  expect(boundary.redirect).toHaveBeenCalledWith("/admin");
});
