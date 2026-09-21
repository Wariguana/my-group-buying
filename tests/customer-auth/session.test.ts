// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  getDb: vi.fn(), transaction: vi.fn(), upsert: vi.fn(), create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: db.getDb }));

import { hashSessionToken } from "@/lib/auth/session-token";
import {
  CUSTOMER_SESSION_TTL_SECONDS,
  createCustomerSession,
  getCustomerAccountBySessionToken,
  revokeCustomerSession,
} from "@/lib/customer-auth/session";

const now = new Date("2026-09-22T00:00:00.000Z");
const identity = { lineUserId: "stable-sub", displayName: "First Name", pictureUrl: "https://example.com/a.png" };
const account = { id: "account-id", ...identity };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  db.getDb.mockReturnValue({
    $transaction: db.transaction,
    customerSession: { findUnique: db.findUnique, deleteMany: db.deleteMany },
  });
  db.transaction.mockImplementation(async (callback) => callback({
    customerAccount: { upsert: db.upsert },
    customerSession: { create: db.create },
  }));
  db.upsert.mockResolvedValue(account);
  db.create.mockResolvedValue({ id: "session-id" });
  db.deleteMany.mockResolvedValue({ count: 1 });
  db.findUnique.mockResolvedValue({ expiresAt: new Date(now.getTime() + 1), customerAccount: account });
});

afterEach(() => vi.useRealTimers());

test("verified sub is the sole upsert identity and re-login does not create another account path", async () => {
  await createCustomerSession(identity);
  await createCustomerSession({ ...identity, displayName: "Renamed", pictureUrl: null });
  expect(db.upsert).toHaveBeenCalledTimes(2);
  expect(db.upsert.mock.calls.map(([args]) => args.where)).toEqual([
    { lineUserId: identity.lineUserId },
    { lineUserId: identity.lineUserId },
  ]);
  expect(db.upsert.mock.calls[1][0].update).toMatchObject({ displayName: "Renamed", pictureUrl: null });
  expect(JSON.stringify(db.upsert.mock.calls)).not.toContain("phone");
});

test("session persistence stores only SHA-256 token hash and a 30-day expiry", async () => {
  const result = await createCustomerSession(identity);
  const data = db.create.mock.calls[0][0].data;
  expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(data.tokenHash).toBe(hashSessionToken(result.token));
  expect(data.tokenHash).not.toBe(result.token);
  expect(data).not.toHaveProperty("token");
  expect(data.expiresAt).toEqual(new Date(now.getTime() + CUSTOMER_SESSION_TTL_SECONDS * 1000));
});

test.each([-1, 0])("expired session at now offset %i is rejected", async (offset) => {
  const rawToken = "t".repeat(43);
  db.findUnique.mockResolvedValue({ expiresAt: new Date(now.getTime() + offset), customerAccount: account });
  await expect(getCustomerAccountBySessionToken(rawToken)).resolves.toBeNull();
  expect(db.findUnique.mock.calls[0][0].where.tokenHash).toBe(hashSessionToken(rawToken));
});

test("valid session returns only the customer account projection", async () => {
  const rawToken = "t".repeat(43);
  await expect(getCustomerAccountBySessionToken(rawToken)).resolves.toEqual(account);
  expect(db.findUnique.mock.calls[0][0].select).toEqual({
    expiresAt: true,
    customerAccount: { select: { id: true, lineUserId: true, displayName: true, pictureUrl: true } },
  });
});

test("logout revokes only the hash of the current valid session token", async () => {
  const rawToken = "t".repeat(43);
  await revokeCustomerSession(rawToken);
  expect(db.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { tokenHash: hashSessionToken(rawToken) } });
  expect(JSON.stringify(db.deleteMany.mock.calls)).not.toContain(rawToken);
});
