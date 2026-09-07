// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const db = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: db.getDb }));
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";
import { createAdminSession, getAdminBySessionToken, revokeAdminSession } from "@/lib/auth/session";

const now = new Date("2026-09-08T10:00:00.123Z");
const user = { id: "admin-id", email: "admin@example.com", isActive: true };
let token: string;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  token = generateSessionToken();
  db.getDb.mockReturnValue({ session: db });
  db.create.mockResolvedValue({ id: "session-id" });
  db.deleteMany.mockResolvedValue({ count: 0 });
  db.findUnique.mockResolvedValue({ expiresAt: new Date(now.getTime() + 1000), user });
});
afterEach(() => vi.useRealTimers());

test("create stores only SHA-256 and returns raw token and exact seven-day expiry", async () => {
  const result = await createAdminSession(user.id);
  const args = db.create.mock.calls[0][0];
  expect(Object.keys(result).sort()).toEqual(["expiresAt", "token"]);
  expect(Object.keys(args.data).sort()).toEqual(["expiresAt", "tokenHash", "userId"]);
  expect(args.data.userId).toBe(user.id);
  expect(args.data.tokenHash === result.token).toBe(false);
  expect(args.data.tokenHash === hashSessionToken(result.token)).toBe(true);
  expect(/^[a-f0-9]{64}$/.test(args.data.tokenHash)).toBe(true);
  expect(/^[A-Za-z0-9_-]{43}$/.test(result.token)).toBe(true);
  expect(result.expiresAt.getTime()).toBe(now.getTime() + 604800000);
  expect(args.data.expiresAt).toEqual(result.expiresAt);
});

test("lookup selects necessary fields, hashes the token and returns public user only", async () => {
  db.findUnique.mockResolvedValue({ expiresAt: new Date(now.getTime() + 1), user: { ...user, passwordHash: "unexpected" } });
  expect(await getAdminBySessionToken(token)).toEqual(user);
  const args = db.findUnique.mock.calls[0][0];
  expect(args.where.tokenHash === hashSessionToken(token)).toBe(true);
  expect(args.select).toEqual({ expiresAt: true, user: { select: { id: true, email: true, isActive: true } } });
  expect(db.create).not.toHaveBeenCalled();
  expect(db.deleteMany).not.toHaveBeenCalled();
});

test.each([undefined, null, 123, "", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "=", "a".repeat(42) + "/", "a".repeat(42) + "\n", "a".repeat(100000)])(
  "malformed token avoids all DB calls for lookup and revoke case %#", async (input) => {
    expect(await getAdminBySessionToken(input)).toBeNull();
    await revokeAdminSession(input);
    expect(db.getDb).not.toHaveBeenCalled();
  },
);

test("unknown session returns null", async () => {
  db.findUnique.mockResolvedValue(null);
  expect(await getAdminBySessionToken(token)).toBeNull();
});
test.each([-1, 0])("expiry at now %+i milliseconds is invalid without deletion", async (offset) => {
  db.findUnique.mockResolvedValue({ expiresAt: new Date(now.getTime() + offset), user });
  expect(await getAdminBySessionToken(token)).toBeNull();
  expect(db.deleteMany).not.toHaveBeenCalled();
});
test("rechecks user activity on every call with the same token", async () => {
  expect(await getAdminBySessionToken(token)).toEqual(user);
  db.findUnique.mockResolvedValue({ expiresAt: new Date(now.getTime() + 1000), user: { ...user, isActive: false } });
  expect(await getAdminBySessionToken(token)).toBeNull();
  expect(db.findUnique).toHaveBeenCalledTimes(2);
});
test("revoke hashes only the current token and remains idempotent for missing sessions", async () => {
  await revokeAdminSession(token);
  await revokeAdminSession(token);
  expect(db.deleteMany).toHaveBeenCalledTimes(2);
  expect(db.deleteMany.mock.calls.every(([args]) => args.where.tokenHash === hashSessionToken(token))).toBe(true);
  expect(Object.keys(db.deleteMany.mock.calls[0][0].where)).toEqual(["tokenHash"]);
});
test("session persistence failures are sanitized", async () => {
  db.create.mockRejectedValue(new Error(token));
  db.findUnique.mockRejectedValue(new Error(token));
  db.deleteMany.mockRejectedValue(new Error(token));
  await expect(createAdminSession(user.id)).rejects.toThrow("Admin session creation failed.");
  await expect(getAdminBySessionToken(token)).rejects.toThrow("Admin session lookup failed.");
  await expect(revokeAdminSession(token)).rejects.toThrow("Admin session revocation failed.");
});
