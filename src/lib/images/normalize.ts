import "server-only";

import sharp from "sharp";

export const MAX_RAW_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class InvalidImageUploadError extends Error {}

export async function normalizeGroupBuyImage(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RAW_IMAGE_BYTES) {
    throw new InvalidImageUploadError("Invalid image size.");
  }
  try {
    const decoder = sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 });
    const metadata = await decoder.metadata();
    if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
      throw new InvalidImageUploadError("Unsupported image format.");
    }
    const output = await decoder
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return new Uint8Array(output);
  } catch (error) {
    if (error instanceof InvalidImageUploadError) throw error;
    throw new InvalidImageUploadError("Invalid image data.");
  }
}
