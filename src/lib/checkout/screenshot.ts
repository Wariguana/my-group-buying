import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export async function normalizeScreenshot(bytes: Uint8Array) {
    if (!bytes.byteLength || bytes.byteLength > MAX_SCREENSHOT_BYTES)
        throw new Error("截圖必須小於 5 MB。");
    const metadata = await sharp(bytes, { limitInputPixels: 20000000, failOn: "warning" }).metadata();
    if (!['jpeg', 'png'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
        throw new Error("截圖只接受單張 JPG／PNG。");
    const screenshot = await sharp(bytes, { limitInputPixels: 20000000, failOn: "warning" }).rotate().png().toBuffer();
    if (screenshot.length > MAX_SCREENSHOT_BYTES)
        throw new Error("處理後截圖超過 5 MB。");
    return { screenshot, mimeType: "image/png", sha256: createHash("sha256").update(screenshot).digest("hex") };
}
