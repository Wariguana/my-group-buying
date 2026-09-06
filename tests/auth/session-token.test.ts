// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";

test("generates canonical unpadded base64url tokens from 32 random bytes", () => {
  const token = generateSessionToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const decoded = Buffer.from(token, "base64url");
  expect(decoded).toHaveLength(32);
  expect(decoded.toString("base64url")).toBe(token);
});

test("generates distinct consecutive tokens", () => {
  expect(generateSessionToken()).not.toBe(generateSessionToken());
});

test("hashes the same token deterministically", () => {
  const token = generateSessionToken();
  expect(hashSessionToken(token)).toBe(hashSessionToken(token));
});

test("hashes different tokens differently", () => {
  expect(hashSessionToken(generateSessionToken()))
    .not.toBe(hashSessionToken(generateSessionToken()));
});

test("returns a 64-character lowercase hex digest distinct from the raw token", () => {
  const token = generateSessionToken();
  const hash = hashSessionToken(token);
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(hash).not.toBe(token);
});

test("uses SHA-256 of the raw UTF-8 string, with a known digest", () => {
  expect(hashSessionToken("abc"))
    .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(hashSessionToken(" abc ")).not.toBe(hashSessionToken("abc"));
  expect(hashSessionToken("ABC")).not.toBe(hashSessionToken("abc"));
});
