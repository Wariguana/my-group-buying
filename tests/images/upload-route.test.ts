// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ currentAdmin: vi.fn(), cleanup: vi.fn(), create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ getCurrentAdmin: boundary.currentAdmin }));
vi.mock("@/lib/images/pending-upload-service", () => ({
  cleanupExpiredPendingUploads: boundary.cleanup,
  createPendingGroupBuyImageUpload: boundary.create,
}));

import { InvalidImageUploadError, MAX_RAW_IMAGE_BYTES } from "@/lib/images/normalize";
import { POST } from "@/app/api/admin/group-buy-images/route";

const adminId = "11111111-1111-4111-8111-111111111111";

function request(file = new File([new Uint8Array([1, 2, 3])], "user-name.png", { type: "image/png" }), origin = "https://app.example") {
  const form = new FormData();
  form.set("image", file);
  return new Request("https://app.example/api/admin/group-buy-images", { method: "POST", headers: { origin }, body: form });
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.currentAdmin.mockResolvedValue({ id: adminId });
  boundary.create.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", imageUrl: "https://images.example/new.webp", byteSize: 10, mimeType: "image/webp" });
});

test("requires Admin authentication before parsing or uploading", async () => {
  boundary.currentAdmin.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(boundary.create).not.toHaveBeenCalled();
});

test("enforces same-origin POST expectations", async () => {
  expect((await POST(request(undefined, "https://evil.example"))).status).toBe(403);
  expect(boundary.create).not.toHaveBeenCalled();
});

test("passes only file bytes and authenticated Admin ownership to the pending service", async () => {
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(boundary.create).toHaveBeenCalledWith(adminId, expect.any(Uint8Array));
  expect(await response.json()).toEqual(expect.objectContaining({ id: expect.any(String), imageUrl: "https://images.example/new.webp" }));
});

test("rejects an oversized raw file", async () => {
  const response = await POST(request(new File([new Uint8Array(MAX_RAW_IMAGE_BYTES + 1)], "big.png")));
  expect(response.status).toBe(413);
  expect(boundary.create).not.toHaveBeenCalled();
});

test("returns a generic image error for decoder rejection and hides storage details", async () => {
  boundary.create.mockRejectedValueOnce(new InvalidImageUploadError("decoder internals"));
  expect(await (await POST(request())).json()).toEqual({ error: "只接受有效的 JPEG、PNG 或 WebP 圖片。" });
  boundary.create.mockRejectedValueOnce(new Error("AccessKey secret provider detail"));
  const payload = await (await POST(request())).json();
  expect(payload).toEqual({ error: "圖片上傳失敗，請稍後再試。" });
  expect(JSON.stringify(payload)).not.toContain("AccessKey");
});
