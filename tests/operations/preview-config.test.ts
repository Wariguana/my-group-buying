// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test.each([
  ["development", "1", ".temp/adm-preview/next"],
  ["development", undefined, undefined],
  ["production", "1", undefined],
] as const)("ADM cache configuration for %s / %s", async (nodeEnv, preview, expected) => {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("ADM_PREVIEW", preview);
  vi.resetModules();
  expect((await import("../../next.config")).default.distDir).toBe(expected);
});
