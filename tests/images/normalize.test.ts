// @vitest-environment node

import sharp from "sharp";
import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { InvalidImageUploadError, MAX_RAW_IMAGE_BYTES, normalizeGroupBuyImage } from "@/lib/images/normalize";

async function image(format: "jpeg" | "png" | "webp") {
  const pipeline = sharp({ create: { width: 3, height: 2, channels: 3, background: "#ef4444" } });
  return new Uint8Array(await pipeline[format]().toBuffer());
}

test.each(["jpeg", "png", "webp"] as const)("accepts %s and normalizes it to metadata-free WebP", async (format) => {
  const output = await normalizeGroupBuyImage(await image(format));
  const metadata = await sharp(output).metadata();
  expect(metadata).toMatchObject({ format: "webp", width: 3, height: 2 });
  expect(metadata.exif).toBeUndefined();
  expect(metadata.icc).toBeUndefined();
});

test("auto-rotates and constrains dimensions without enlargement", async () => {
  const large = new Uint8Array(await sharp({ create: { width: 2100, height: 1000, channels: 3, background: "white" } }).jpeg().toBuffer());
  const metadata = await sharp(await normalizeGroupBuyImage(large)).metadata();
  expect(metadata.width).toBe(2000);
  expect(metadata.height).toBeLessThanOrEqual(2000);
});

test.each([
  ["SVG", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>')],
  ["arbitrary file", new TextEncoder().encode("not an image")],
  ["empty file", new Uint8Array()],
] as const)("rejects %s", async (_label, bytes) => {
  await expect(normalizeGroupBuyImage(bytes)).rejects.toBeInstanceOf(InvalidImageUploadError);
});

test("rejects raw files over 8 MB before decoding", async () => {
  await expect(normalizeGroupBuyImage(new Uint8Array(MAX_RAW_IMAGE_BYTES + 1))).rejects.toBeInstanceOf(InvalidImageUploadError);
});
