// @vitest-environment node

import { randomBytes } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";

const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  getDb: vi.fn(),
}));
const passwordBoundary = vi.hoisted(() => ({ hashPassword: vi.fn() }));

vi.mock("server-only", () => ({}));
// Never import the real database boundary or open a connection in these tests.
vi.mock("@/lib/db", () => ({ getDb: db.getDb }));
vi.mock("@/lib/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password")>();
  passwordBoundary.hashPassword.mockImplementation(actual.hashPassword);
  return { ...actual, hashPassword: passwordBoundary.hashPassword };
});

import { Prisma as PrismaRuntime } from "@/generated/prisma/client";
import { AdminBootstrapError, createFirstAdmin } from "@/lib/auth/bootstrap-admin";
import { verifyPassword } from "@/lib/auth/password";

const transactionClient = { user: { findFirst: db.findFirst, create: db.create } };
const publicUser = { id: "test-user-id", email: "admin@example.com", isActive: true };
let password: string;

beforeEach(() => {
  vi.clearAllMocks();
  // Ephemeral test input, never an actual bootstrap credential or snapshot.
  password = ` A${randomBytes(16).toString("hex")}e\u0301 `;
  db.findFirst.mockResolvedValue(null);
  db.create.mockResolvedValue(publicUser);
  db.transaction.mockImplementation(async (work) => work(transactionClient));
  db.getDb.mockReturnValue({ $transaction: db.transaction });
});

test("persists normalized email and a real Argon2 hash of the unchanged password", async () => {
  const result = await createFirstAdmin({ email: " ADMIN@Example.COM ", password });
  expect(result).toEqual(publicUser);
  expect(result).not.toHaveProperty("passwordHash");
  expect(db.findFirst).toHaveBeenCalledWith({ select: { id: true } });
  expect(db.create).toHaveBeenCalledTimes(1);
  const args: Prisma.UserCreateArgs = db.create.mock.calls[0][0];
  expect(args.data.email).toBe("admin@example.com");
  expect(args.data.isActive).toBe(true);
  expect(args.data).not.toHaveProperty("password");
  expect(args.data.passwordHash).not.toBe(password);
  expect(passwordBoundary.hashPassword).toHaveBeenCalledExactlyOnceWith(password);
  expect(args.select).toEqual({ id: true, email: true, isActive: true });
  await expect(verifyPassword(password, args.data.passwordHash)).resolves.toBe(true);
  for (const changed of [password.trim(), password.toLowerCase(), password.normalize("NFC")]) {
    await expect(verifyPassword(changed, args.data.passwordHash)).resolves.toBe(false);
  }
});

test.each([true, false])("rejects an existing user with isActive=%s", async (isActive) => {
  db.findFirst.mockResolvedValue({ id: "existing-user", isActive });
  await expect(createFirstAdmin({ email: "another@example.com", password }))
    .rejects.toMatchObject({ code: "USER_EXISTS" });
  expect(db.findFirst).toHaveBeenCalledWith({ select: { id: true } });
  expect(passwordBoundary.hashPassword).toHaveBeenCalledExactlyOnceWith(password);
  expect(db.create).not.toHaveBeenCalled();
});

test.each([
  () => null,
  () => ({}),
  () => ({ email: "invalid", password }),
  () => ({ email: "admin@example.com", password: "a".repeat(11) }),
  () => ({ email: "admin@example.com", password: "a".repeat(129) }),
  () => ({ email: "admin@example.com", password: 123 }),
  () => ({ email: "admin@example.com", password, passwordHash: "untrusted" }),
  () => ({ email: "admin@example.com", password, isActive: false }),
])("rejects invalid input before touching the database case %#", async (input) => {
  await expect(createFirstAdmin(input())).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(passwordBoundary.hashPassword).not.toHaveBeenCalled();
  expect(db.getDb).not.toHaveBeenCalled();
  expect(db.transaction).not.toHaveBeenCalled();
  expect(db.create).not.toHaveBeenCalled();
});

test("hashes before the Serializable transaction, which contains findFirst and create", async () => {
  await createFirstAdmin({ email: "admin@example.com", password });
  expect(db.transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
    isolationLevel: "Serializable",
  });
  expect(passwordBoundary.hashPassword.mock.invocationCallOrder[0])
    .toBeLessThan(db.transaction.mock.invocationCallOrder[0]);
  expect(db.transaction.mock.invocationCallOrder[0])
    .toBeLessThan(db.findFirst.mock.invocationCallOrder[0]);
  expect(db.findFirst.mock.invocationCallOrder[0]).toBeLessThan(db.create.mock.invocationCallOrder[0]);
});

test("does not report success if serialization fails at commit, and does not retry unsafely", async () => {
  db.transaction.mockImplementationOnce(async (work) => {
    await work(transactionClient);
    throw new PrismaRuntime.PrismaClientKnownRequestError("serialization failure", {
      code: "P2034", clientVersion: "7.10.0",
    });
  });
  await expect(createFirstAdmin({ email: "admin@example.com", password }))
    .rejects.toMatchObject({ code: "CONFLICT" });
  expect(passwordBoundary.hashPassword).toHaveBeenCalledExactlyOnceWith(password);
  expect(db.transaction).toHaveBeenCalledTimes(1);
  expect(db.create).toHaveBeenCalledTimes(1);

  // An explicit retry starts over and must observe the winning user.
  db.findFirst.mockResolvedValue({ id: "winning-user" });
  await expect(createFirstAdmin({ email: "admin@example.com", password }))
    .rejects.toMatchObject({ code: "USER_EXISTS" });
  expect(db.create).toHaveBeenCalledTimes(1);
});

test.each(["40001", "40P01"])(
  "maps a structured adapter transaction conflict with code %s to CONFLICT",
  async (originalCode) => {
    db.transaction.mockImplementationOnce(async (work) => {
      await work(transactionClient);
      throw { cause: { kind: "TransactionWriteConflict", originalCode } };
    });

    await expect(createFirstAdmin({ email: "admin@example.com", password }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  },
);

const nonConflictErrors: ReadonlyArray<readonly [string, () => unknown]> = [
  ["wrong original code", () => ({ cause: { kind: "TransactionWriteConflict", originalCode: "23505" } })],
  ["wrong kind", () => ({ cause: { kind: "OtherError", originalCode: "40001" } })],
  ["message only", () => new Error("structured fields absent: 40001")],
  ["arbitrary cause", () => ({ cause: { arbitrary: true } })],
  ["null cause", () => ({ cause: null })],
  ["string cause", () => ({ cause: "40001" })],
  ["null error", () => null],
  ["string error", () => "TransactionWriteConflict 40001"],
  ["constructor name only", () => new (class DriverAdapterError extends Error {})()],
];

test.each(nonConflictErrors)("does not classify %s as a transaction conflict", async (_label, makeError) => {
  db.transaction.mockImplementationOnce(async (work) => {
    await work(transactionClient);
    throw makeError();
  });

  await expect(createFirstAdmin({ email: "admin@example.com", password }))
    .rejects.toMatchObject({ code: "FAILED" });
});

test("exposes only public fields even if persistence returns additional data", async () => {
  db.create.mockImplementation(async ({ data }) => ({ ...publicUser, passwordHash: data.passwordHash }));
  const result = await createFirstAdmin({ email: "admin@example.com", password });
  expect(Object.keys(result).sort()).toEqual(["email", "id", "isActive"]);
});

test("sanitizes persistence errors that could contain passwordHash or query arguments", async () => {
  db.create.mockImplementation(async ({ data }) => {
    throw new Error(JSON.stringify(data));
  });
  const outcome = await createFirstAdmin({ email: "admin@example.com", password }).catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(AdminBootstrapError);
  expect(outcome).toMatchObject({ code: "FAILED", message: "First admin bootstrap failed." });
  expect(outcome).not.toHaveProperty("cause");
  expect(JSON.stringify(outcome)).not.toContain("passwordHash");
  expect(JSON.stringify(outcome)).not.toContain(password);
});

test("fails closed if the existence check fails", async () => {
  db.findFirst.mockRejectedValue(new Error("read failed"));
  await expect(createFirstAdmin({ email: "admin@example.com", password }))
    .rejects.toMatchObject({ code: "FAILED" });
  expect(db.create).not.toHaveBeenCalled();
});
