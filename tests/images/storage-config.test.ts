// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isE2eImageStorageEnabled, readImageStorageConfig } from "@/lib/images/storage/config";

test("E2E storage requires both the explicit flag and exact disposable database name", () => {
  expect(isE2eImageStorageEnabled({
    NODE_ENV: "test",
    E2E_GROUP_BUY_IMAGE_STORAGE: "1",
    DATABASE_URL: "postgresql://user:pass@localhost:5433/my_group_buying_dev",
  } as NodeJS.ProcessEnv)).toBe(false);
  expect(isE2eImageStorageEnabled({
    NODE_ENV: "test",
    E2E_GROUP_BUY_IMAGE_STORAGE: "1",
    DATABASE_URL: "postgresql://user:pass@localhost:5433/my_group_buying_e2e_0123456789abcdef0123456789abcdef",
  } as NodeJS.ProcessEnv)).toBe(true);
  expect(isE2eImageStorageEnabled({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://user:pass@localhost:5433/my_group_buying_e2e_0123456789abcdef0123456789abcdef",
  } as NodeJS.ProcessEnv)).toBe(false);
});

test("production storage validates server-only configuration and HTTPS public URLs", () => {
  const environment = {
    NODE_ENV: "production",
    GROUP_BUY_IMAGE_STORAGE_ENDPOINT: "https://s3.example.com",
    GROUP_BUY_IMAGE_STORAGE_REGION: "auto",
    GROUP_BUY_IMAGE_STORAGE_BUCKET: "images",
    GROUP_BUY_IMAGE_STORAGE_ACCESS_KEY_ID: "access",
    GROUP_BUY_IMAGE_STORAGE_SECRET_ACCESS_KEY: "secret",
    GROUP_BUY_IMAGE_PUBLIC_BASE_URL: "https://images.example.com/",
  } as NodeJS.ProcessEnv;
  expect(readImageStorageConfig(environment)).toEqual(expect.objectContaining({ publicBaseUrl: "https://images.example.com" }));
  expect(() => readImageStorageConfig({ ...environment, GROUP_BUY_IMAGE_PUBLIC_BASE_URL: "http://images.example.com" })).toThrow("Image storage is not configured.");
});
