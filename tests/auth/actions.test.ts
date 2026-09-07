// @vitest-environment node
import { randomBytes } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
const boundary = vi.hoisted(() => ({
  authenticate: vi.fn(), create: vi.fn(), revoke: vi.fn(), cookies: vi.fn(),
  get: vi.fn(), set: vi.fn(), redirect: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));
vi.mock("@/lib/auth/credentials", () => ({ authenticateAdminCredentials: boundary.authenticate }));
vi.mock("@/lib/auth/session", () => ({ createAdminSession: boundary.create, revokeAdminSession: boundary.revoke }));
import { loginAdmin, logoutAdmin } from "@/app/admin/actions";
import { adminLoginInputSchema } from "@/lib/auth/validation";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/cookie";

const admin = { id: "admin-id", email: "admin@example.com", isActive: true };
const redirectSignal = new Error("test redirect control flow");
let token: string;
let password: string;
let form: FormData;
const expiresAt = new Date("2026-09-15T10:00:00.123Z");
beforeEach(() => {
  vi.resetAllMocks();
  token = randomBytes(32).toString("base64url");
  password = randomBytes(24).toString("base64url");
  form = new FormData();
  form.set("email", admin.email);
  form.set("password", password);
  boundary.authenticate.mockImplementation(async (input) => adminLoginInputSchema.safeParse(input).success ? admin : null);
  boundary.create.mockResolvedValue({ token, expiresAt });
  boundary.cookies.mockResolvedValue({ get: boundary.get, set: boundary.set });
  boundary.get.mockReturnValue({ value: token });
  boundary.redirect.mockImplementation(() => { throw redirectSignal; });
});

test("invalid credentials never create a session or set a cookie", async () => {
  boundary.authenticate.mockResolvedValue(null);
  expect(await loginAdmin({ error: null }, form)).toEqual({ error: "Email 或密碼錯誤" });
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.set).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test.each(["extra", "duplicate", "file"])("rejects %s form input before session creation", async (kind) => {
  if (kind === "extra") form.set("isActive", "true");
  if (kind === "duplicate") form.append("email", "other@example.com");
  if (kind === "file") form.set("password", new Blob([password]));
  expect(await loginAdmin({ error: null }, form)).toEqual({ error: "Email 或密碼錯誤" });
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.set).not.toHaveBeenCalled();
});

test("success preserves password and orders create, cookie, redirect without catching redirect", async () => {
  form.set("$ACTION_ID_framework", "transport");
  await expect(loginAdmin({ error: null }, form)).rejects.toBe(redirectSignal);
  const input = boundary.authenticate.mock.calls[0][0];
  expect(Object.keys(input).sort()).toEqual(["email", "password"]);
  expect(input.password === password).toBe(true);
  expect(boundary.create).toHaveBeenCalledExactlyOnceWith(admin.id);
  const [name, value, options] = boundary.set.mock.calls[0];
  expect(name).toBe(ADMIN_SESSION_COOKIE_NAME);
  expect(value === token).toBe(true);
  expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt });
  expect(boundary.create.mock.invocationCallOrder[0]).toBeLessThan(boundary.set.mock.invocationCallOrder[0]);
  expect(boundary.set.mock.invocationCallOrder[0]).toBeLessThan(boundary.redirect.mock.invocationCallOrder[0]);
  expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith("/admin");
  expect(boundary.revoke).not.toHaveBeenCalled();
});

test.each(["authenticate", "create"] as const)("%s internal failure returns only generic message and no cookie", async (operation) => {
  boundary[operation].mockRejectedValue(new Error(`${password} ${token}`));
  expect(await loginAdmin({ error: null }, form)).toEqual({ error: "登入失敗，請稍後再試。" });
  expect(boundary.set).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test.each([false, true])("cookie setting failure attempts rollback even if revoke fails=%s", async (revokeFails) => {
  boundary.set.mockImplementation(() => { throw new Error(token); });
  if (revokeFails) boundary.revoke.mockRejectedValue(new Error(token));
  expect(await loginAdmin({ error: null }, form)).toEqual({ error: "登入失敗，請稍後再試。" });
  expect(boundary.revoke).toHaveBeenCalledTimes(1);
  expect(boundary.revoke.mock.calls[0][0] === token).toBe(true);
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test.each(["current", "missing", "malformed", "revoke failure"])("logout with %s cookie clears same name/path and redirects", async (kind) => {
  if (kind === "missing") boundary.get.mockReturnValue(undefined);
  if (kind === "malformed") boundary.get.mockReturnValue({ value: "invalid" });
  if (kind === "revoke failure") boundary.revoke.mockRejectedValue(new Error(token));
  await expect(logoutAdmin()).rejects.toBe(redirectSignal);
  expect(boundary.get).toHaveBeenCalledWith(ADMIN_SESSION_COOKIE_NAME);
  expect(boundary.revoke).toHaveBeenCalledTimes(1);
  expect(boundary.revoke.mock.calls[0][0] === (kind === "missing" ? undefined : kind === "malformed" ? "invalid" : token)).toBe(true);
  expect(boundary.set).toHaveBeenCalledExactlyOnceWith(ADMIN_SESSION_COOKIE_NAME, "", expect.objectContaining({ path: "/", expires: new Date(0), maxAge: 0 }));
  expect(boundary.revoke.mock.invocationCallOrder[0]).toBeLessThan(boundary.set.mock.invocationCallOrder[0]);
  expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith("/admin/login");
});
