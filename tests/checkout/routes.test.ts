import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const boundary = vi.hoisted(() => ({ admin: vi.fn(), customer: vi.fn(), find: vi.fn(), report: vi.fn(), create: vi.fn(), record: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ getCurrentAdmin: boundary.admin }));
vi.mock("@/lib/customer-auth/current-customer", () => ({ getCurrentCustomerAccount: boundary.customer }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ checkout: { findFirst: boundary.find } }) }));
vi.mock("@/lib/checkout/service", () => ({ CheckoutError: class extends Error {
    }, reportTransfer: boundary.report, createCheckout: boundary.create, recordReceipt: boundary.record }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { GET, POST } from "@/app/api/checkout/[id]/screenshot/route";
import { POST as mutation } from "@/app/api/checkout/route";
const checkoutId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const params = { params: Promise.resolve({ id: checkoutId }) };
beforeEach(() => { vi.resetAllMocks(); boundary.admin.mockResolvedValue(null); boundary.customer.mockResolvedValue(null); });
test("private screenshot denies anonymous without database query", async () => { const r = await GET(new NextRequest("http://localhost/api"), params); expect(r.status).toBe(401); expect(boundary.find).not.toHaveBeenCalled(); });
test("customer screenshot lookup is constrained by ownership", async () => { boundary.customer.mockResolvedValue({ id: ownerId }); boundary.find.mockResolvedValue(null); const r = await GET(new NextRequest("http://localhost/api"), params); expect(r.status).toBe(404); expect(boundary.find.mock.calls[0][0].where).toEqual({ id: checkoutId, customerAccountId: ownerId }); });
test("authorized private screenshot has no-store and nosniff", async () => { boundary.admin.mockResolvedValue({ id: ownerId }); boundary.find.mockResolvedValue({ payment: { bankReport: { screenshot: Buffer.from("image"), mimeType: "image/png" } } }); const r = await GET(new NextRequest("http://localhost/api"), params); expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("private, no-store"); expect(r.headers.get("x-content-type-options")).toBe("nosniff"); });
test("upload rejects forged origin before auth or mutation", async () => { const r = await POST(new NextRequest("http://localhost/api", { method: "POST", headers: { host: "localhost", origin: "https://evil.invalid" }, body: "image" }), params); expect(r.status).toBe(403); expect(boundary.report).not.toHaveBeenCalled(); });
test("upload bounds actual streamed bytes", async () => { boundary.customer.mockResolvedValue({ id: ownerId }); const r = await POST(new NextRequest("http://localhost/api", { method: "POST", headers: { host: "localhost", origin: "http://localhost" }, body: Buffer.alloc(5 * 1024 * 1024 + 1) }), params); expect(r.status).toBe(413); expect(boundary.report).not.toHaveBeenCalled(); });
test("customer cannot record bank receipts as admin", async () => { boundary.customer.mockResolvedValue({ id: ownerId }); const r = await mutation(new NextRequest("http://localhost/api/checkout", { method: "POST", headers: { host: "localhost", origin: "http://localhost" }, body: JSON.stringify({ operation: "receipt", checkoutId, data: {} }) })); expect(r.status).toBe(403); expect(boundary.record).not.toHaveBeenCalled(); });
test("checkout rejects unauthenticated creation", async () => { const r = await mutation(new NextRequest("http://localhost/api/checkout", { method: "POST", headers: { host: "localhost", origin: "http://localhost" }, body: JSON.stringify({ operation: "create", data: {} }) })); expect(r.status).toBe(401); expect(boundary.create).not.toHaveBeenCalled(); });


test("invalid bank data returns field-specific errors without a database write", async () => {
  boundary.admin.mockResolvedValue({ id: ownerId });
  const response = await mutation(new NextRequest("http://localhost/api/checkout", { method: "POST", headers: { host: "localhost", origin: "http://localhost" }, body: JSON.stringify({ operation: "bank", data: { bankName: "測試銀行", bankCode: "12", bankAccount: "invalid", accountName: "測試戶名", enabled: false } }) }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "請修正標示的欄位。", fieldErrors: { bankCode: ["銀行代碼須為 3 位數字，例如 004。"], bankAccount: ["收款帳號須為 6～20 位數字，請勿輸入空格或符號。"] } });
  expect(boundary.record).not.toHaveBeenCalled();
});
