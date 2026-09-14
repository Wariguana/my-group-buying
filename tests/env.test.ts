// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readServerEnvironment } from "@/lib/env";

test.each(["development", "production", "test"] as const)("accepts NODE_ENV=%s", (nodeEnv) => {
  expect(readServerEnvironment({
    NODE_ENV: nodeEnv,
    DATABASE_URL: "postgresql://user:password@db.example.com:5432/group_buying?sslmode=require",
  })).toEqual({
    nodeEnv,
    databaseUrl: "postgresql://user:password@db.example.com:5432/group_buying?sslmode=require",
  });
});

test.each([
  [{ DATABASE_URL: "postgresql://localhost/group_buying" }, "NODE_ENV"],
  [{ NODE_ENV: "staging", DATABASE_URL: "postgresql://localhost/group_buying" }, "NODE_ENV"],
  [{ NODE_ENV: "production" }, "DATABASE_URL"],
  [{ NODE_ENV: "production", DATABASE_URL: "mysql://localhost/group_buying" }, "DATABASE_URL"],
  [{ NODE_ENV: "production", DATABASE_URL: " postgresql://localhost/group_buying" }, "DATABASE_URL"],
] as const)("rejects invalid server environment %#", (environment, field) => {
  expect(() => readServerEnvironment(environment)).toThrow(field);
});
