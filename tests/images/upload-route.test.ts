// @vitest-environment node

import { NextRequest } from "next/server";
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

function request(
  file = new File([new Uint8Array([1, 2, 3])], "user-name.png", { type: "image/png" }),
  {
    url = "https://app.example/api/admin/group-buy-images",
    origin = "https://app.example",
    headers = {},
  }: Readonly<{
    url?: string;
    origin?: string | null;
    headers?: Readonly<Record<string, string>>;
  }> = {},
) {
  const form = new FormData();
  form.set("image", file);
  const requestHeaders = new Headers({ host: new URL(url).host, ...headers });
  if (origin !== null) requestHeaders.set("origin", origin);
  return new NextRequest(url, { method: "POST", headers: requestHeaders, body: form });
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

test("accepts an authenticated direct same-origin request and passes only file bytes and Admin ownership", async () => {
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(boundary.create).toHaveBeenCalledWith(adminId, expect.any(Uint8Array));
  expect(await response.json()).toEqual(expect.objectContaining({ id: expect.any(String), imageUrl: "https://images.example/new.webp" }));
});

test("accepts a public HTTPS origin behind a reverse proxy", async () => {
  const response = await POST(request(undefined, {
    url: "http://localhost:3000/api/admin/group-buy-images",
    origin: "https://example.trycloudflare.com",
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "example.trycloudflare.com",
      "x-forwarded-proto": "https",
    },
  }));

  expect(response.status).toBe(201);
  expect(boundary.create).toHaveBeenCalledWith(adminId, expect.any(Uint8Array));
});

test.each([
  ["attacker origin", "https://evil.example", "example.trycloudflare.com", "https"],
  ["missing Origin", null, "example.trycloudflare.com", "https"],
  ["ambiguous comma-separated x-forwarded-host", "https://example.trycloudflare.com", "example.trycloudflare.com, evil.example", "https"],
  ["ambiguous comma-separated x-forwarded-proto", "https://example.trycloudflare.com", "example.trycloudflare.com", "https,http"],
  ["wrong scheme", "http://example.trycloudflare.com", "example.trycloudflare.com", "https"],
  ["wrong port", "https://example.trycloudflare.com:444", "example.trycloudflare.com", "https"],
  ["deceptive hostname", "https://example.trycloudflare.com.evil.example", "example.trycloudflare.com", "https"],
] as const)("rejects %s before uploading", async (_name, origin, forwardedHost, forwardedProtocol) => {
  const response = await POST(request(undefined, {
    url: "http://localhost:3000/api/admin/group-buy-images",
    origin,
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": forwardedHost,
      "x-forwarded-proto": forwardedProtocol,
    },
  }));

  expect(response.status).toBe(403);
  expect(boundary.create).not.toHaveBeenCalled();
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
