// @vitest-environment node
import { randomBytes } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
const db = vi.hoisted(() => ({ findUnique: vi.fn(), getDb: vi.fn() }));
const cryptoBoundary = vi.hoisted(() => ({ hashPassword: vi.fn(), verifyPassword: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: db.getDb }));
vi.mock("@/lib/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password")>();
  cryptoBoundary.hashPassword.mockImplementation(actual.hashPassword);
  cryptoBoundary.verifyPassword.mockImplementation(actual.verifyPassword);
  return cryptoBoundary;
});
import { authenticateAdminCredentials } from "@/lib/auth/credentials";

const publicAdmin = { id: "admin-id", email: "admin@example.com", isActive: true };
let password: string;
beforeEach(async () => {
  password = randomBytes(24).toString("base64url");
  const passwordHash = await cryptoBoundary.hashPassword(password);
  vi.clearAllMocks();
  db.getDb.mockReturnValue({ user: { findUnique: db.findUnique } });
  db.findUnique.mockResolvedValue({ ...publicAdmin, passwordHash });
});

test("active login uses normalized email, one verification and returns only public fields", async () => {
  const result = await authenticateAdminCredentials({ email: " ADMIN@Example.COM ", password });
  expect(result).toEqual(publicAdmin);
  expect(db.findUnique).toHaveBeenCalledWith({
    where: { email: publicAdmin.email },
    select: { id: true, email: true, isActive: true, passwordHash: true },
  });
  expect(cryptoBoundary.verifyPassword).toHaveBeenCalledTimes(1);
  expect(cryptoBoundary.hashPassword).not.toHaveBeenCalled();
  expect(Object.keys(result!).sort()).toEqual(["email", "id", "isActive"]);
});

test("wrong password returns the single failure contract with no dummy work", async () => {
  const result = await authenticateAdminCredentials({ email: publicAdmin.email, password: randomBytes(24).toString("hex") });
  expect(result).toBeNull();
  expect(cryptoBoundary.verifyPassword).toHaveBeenCalledTimes(1);
  expect(cryptoBoundary.hashPassword).not.toHaveBeenCalled();
});

test.each(["missing", "inactive"])("%s user executes one dummy Argon2 operation and returns null", async (kind) => {
  db.findUnique.mockResolvedValue(kind === "missing" ? null : { ...publicAdmin, isActive: false });
  expect(await authenticateAdminCredentials({ email: publicAdmin.email, password })).toBeNull();
  expect(cryptoBoundary.hashPassword).toHaveBeenCalledTimes(1);
  expect(cryptoBoundary.hashPassword.mock.calls[0][0] === password).toBe(true);
  expect(cryptoBoundary.verifyPassword).not.toHaveBeenCalled();
});

test("malformed stored hash returns the same credential failure", async () => {
  db.findUnique.mockResolvedValue({ ...publicAdmin, passwordHash: randomBytes(8).toString("hex") });
  expect(await authenticateAdminCredentials({ email: publicAdmin.email, password })).toBeNull();
});

test("invalid input does not access DB or Argon2", async () => {
  expect(await authenticateAdminCredentials({ email: "invalid", password })).toBeNull();
  expect(db.getDb).not.toHaveBeenCalled();
  expect(cryptoBoundary.hashPassword).not.toHaveBeenCalled();
  expect(cryptoBoundary.verifyPassword).not.toHaveBeenCalled();
});

test("database errors are sanitized without their cause", async () => {
  db.findUnique.mockRejectedValue(new Error(password));
  const result = await authenticateAdminCredentials({ email: publicAdmin.email, password }).catch((error: unknown) => error);
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toBe("Admin authentication failed.");
  expect(result).not.toHaveProperty("cause");
});
