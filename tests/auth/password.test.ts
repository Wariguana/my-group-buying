// @vitest-environment node

import { argon2 } from "node:crypto";
import { beforeAll, expect, test, vi } from "vitest";

// Next.js supplies this build-time boundary; these tests run directly in Node.
vi.mock("server-only", () => ({}));

import { hashPassword, verifyPassword } from "@/lib/auth/password";

const password = "Auth test password!";
const header = "v1$argon2id$m=19456,t=2,p=1,l=32";
let encodedHash: string;

beforeAll(async () => {
  encodedHash = await hashPassword(password);
});

test("encodes the version, algorithm, policy, 16-byte salt and 32-byte key", () => {
  expect(encodedHash).toMatch(
    /^v1\$argon2id\$m=19456,t=2,p=1,l=32\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/,
  );
  const fields = encodedHash.split("$");
  expect(Buffer.from(fields[3], "base64url")).toHaveLength(16);
  expect(Buffer.from(fields[4], "base64url")).toHaveLength(32);
});

test("verifies the correct password", async () => {
  await expect(verifyPassword(password, encodedHash)).resolves.toBe(true);
});

test("rejects the wrong password", async () => {
  await expect(verifyPassword("wrong password", encodedHash)).resolves.toBe(false);
});

test("uses a different random salt for the same password", async () => {
  const anotherHash = await hashPassword(password);
  expect(anotherHash).not.toBe(encodedHash);
  expect(anotherHash.split("$")[3]).not.toBe(encodedHash.split("$")[3]);
  await expect(verifyPassword(password, anotherHash)).resolves.toBe(true);
});

test("preserves leading and trailing whitespace", async () => {
  const spacedPassword = ` \t${password}\n `;
  const hash = await hashPassword(spacedPassword);
  await expect(verifyPassword(spacedPassword, hash)).resolves.toBe(true);
  await expect(verifyPassword(password, hash)).resolves.toBe(false);
  await expect(verifyPassword(spacedPassword, encodedHash)).resolves.toBe(false);
});

test("preserves password case", async () => {
  await expect(verifyPassword(password.toLowerCase(), encodedHash)).resolves.toBe(false);
  const lowercaseHash = await hashPassword(password.toLowerCase());
  await expect(verifyPassword(password, lowercaseHash)).resolves.toBe(false);
});

test("does not normalize Unicode", async () => {
  const composed = "caf\u00e9";
  const decomposed = "cafe\u0301";
  const hash = await hashPassword(composed);
  await expect(verifyPassword(composed, hash)).resolves.toBe(true);
  await expect(verifyPassword(decomposed, hash)).resolves.toBe(false);
});

test("preserves embedded NUL characters", async () => {
  const hash = await hashPassword("before\0after");
  await expect(verifyPassword("before\0after", hash)).resolves.toBe(true);
  await expect(verifyPassword("before", hash)).resolves.toBe(false);
});

test("matches Node Argon2id with the declared policy", async () => {
  const fields = encodedHash.split("$");
  const key = await new Promise<Buffer>((resolve, reject) => {
    argon2("argon2id", {
      message: password,
      nonce: Buffer.from(fields[3], "base64url"),
      memory: 19456,
      passes: 2,
      parallelism: 1,
      tagLength: 32,
    }, (error, result) => error ? reject(error) : resolve(result));
  });
  expect(key.toString("base64url")).toBe(fields[4]);
});

test("rejects a tampered derived hash", async () => {
  const fields = encodedHash.split("$");
  const key = Buffer.from(fields[4], "base64url");
  key[0] ^= 1;
  fields[4] = key.toString("base64url");
  await expect(verifyPassword(password, fields.join("$"))).resolves.toBe(false);
});

test("rejects a tampered salt", async () => {
  const fields = encodedHash.split("$");
  const salt = Buffer.from(fields[3], "base64url");
  salt[0] ^= 1;
  fields[3] = salt.toString("base64url");
  await expect(verifyPassword(password, fields.join("$"))).resolves.toBe(false);
});

test.each([
  ["unknown version", "v2$argon2id$m=19456,t=2,p=1,l=32"],
  ["unknown algorithm", "v1$argon2ix$m=19456,t=2,p=1,l=32"],
  ["different Argon2 variant", "v1$argon2i$m=19456,t=2,p=1,l=32"],
  ["lower memory", "v1$argon2id$m=19455,t=2,p=1,l=32"],
  ["excessive memory", "v1$argon2id$m=99999,t=2,p=1,l=32"],
  ["different passes", "v1$argon2id$m=19456,t=3,p=1,l=32"],
  ["different parallelism", "v1$argon2id$m=19456,t=2,p=2,l=32"],
  ["different tag length", "v1$argon2id$m=19456,t=2,p=1,l=31"],
  ["negative parameter", "v1$argon2id$m=19456,t=-2,p=1,l=32"],
  ["zero parameter", "v1$argon2id$m=19456,t=0,p=1,l=32"],
  ["non-numeric parameter", "v1$argon2id$m=19456,t=x,p=1,l=32"],
  ["decimal parameter", "v1$argon2id$m=19456,t=2.0,p=1,l=32"],
  ["leading zero", "v1$argon2id$m=19456,t=02,p=1,l=32"],
  ["exponent notation", "v1$argon2id$m=19456,t=2e0,p=1,l=32"],
  ["missing parameter", "v1$argon2id$m=19456,t=2,p=1"],
  ["duplicate parameter", "v1$argon2id$m=19456,t=2,p=1,l=32,t=2"],
  ["extra parameter", "v1$argon2id$m=19456,t=2,p=1,l=32,x=1"],
  ["reordered parameters", "v1$argon2id$t=2,m=19456,p=1,l=32"],
])("rejects %s", async (_label, invalidHeader) => {
  const fields = encodedHash.split("$");
  await expect(verifyPassword(password, `${invalidHeader}$${fields[3]}$${fields[4]}`))
    .resolves.toBe(false);
});

test.each([
  ["empty string", ""],
  ["arbitrary text", "not a password hash"],
  ["missing fields", header],
  ["extra field", `${header}$${"A".repeat(22)}$${"A".repeat(43)}$extra`],
  ["short salt", `${header}$${Buffer.alloc(15).toString("base64url")}$${"A".repeat(43)}`],
  ["long salt", `${header}$${Buffer.alloc(17).toString("base64url")}$${"A".repeat(43)}`],
  ["short key", `${header}$${"A".repeat(22)}$${Buffer.alloc(31).toString("base64url")}`],
  ["long key", `${header}$${"A".repeat(22)}$${Buffer.alloc(33).toString("base64url")}`],
  ["invalid salt character", `${header}$!${"A".repeat(21)}$${"A".repeat(43)}`],
  ["invalid key character", `${header}$${"A".repeat(22)}$!${"A".repeat(42)}`],
  ["standard base64 salt", `${header}$+${"A".repeat(21)}$${"A".repeat(43)}`],
  ["standard base64 key", `${header}$${"A".repeat(22)}$/${"A".repeat(42)}`],
  ["salt padding", `${header}$${"A".repeat(21)}=$${"A".repeat(43)}`],
  ["key padding", `${header}$${"A".repeat(22)}$${"A".repeat(42)}=`],
  ["non-canonical salt bits", `${header}$${"A".repeat(21)}B$${"A".repeat(43)}`],
  ["non-canonical key bits", `${header}$${"A".repeat(22)}$${"A".repeat(42)}B`],
  ["embedded whitespace", `${header}$ ${"A".repeat(21)}$${"A".repeat(43)}`],
  ["trailing newline", `${header}$${"A".repeat(22)}$${"A".repeat(43)}\n`],
  ["oversized input", "A".repeat(10000)],
])("returns false without throwing for %s", async (_label, malformed) => {
  await expect(verifyPassword(password, malformed)).resolves.toBe(false);
});
