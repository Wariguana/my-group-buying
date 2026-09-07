// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.requireAdmin }));
vi.mock("@/lib/products/service", () => ({
  createProduct: boundary.create,
  updateProduct: boundary.update,
  setProductActive: boundary.setActive,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import {
  createProductAction,
  deactivateProductAction,
  reactivateProductAction,
  updateProductAction,
} from "@/app/admin/(protected)/products/actions";

const id = "11111111-1111-4111-8111-111111111111";
const supplierId = "22222222-2222-4222-8222-222222222222";
const redirectSignal = new Error("redirect control flow");
const authSignal = new Error("unauthenticated redirect");
const initialProductFormState = { fieldErrors: {}, formError: null };

function validForm() {
  const form = new FormData();
  form.set("name", "  鳳梨酥  ");
  form.set("description", "  十二入  ");
  form.set("imageUrl", " https://example.com/product.jpg ");
  form.set("defaultPrice", "1200");
  form.set("cost", "800");
  form.set("unit", "  盒  ");
  form.set("supplierId", supplierId);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.requireAdmin.mockResolvedValue({ id: "admin-id" });
  boundary.create.mockResolvedValue({ ok: true, value: { id } });
  boundary.update.mockResolvedValue({ ok: true, value: { id } });
  boundary.setActive.mockImplementation(async (_id, isActive) => ({ ok: true, value: { id, isActive } }));
  boundary.redirect.mockImplementation(() => { throw redirectSignal; });
});

test.each([
  ["create", () => createProductAction(initialProductFormState, validForm())],
  ["update", () => updateProductAction(id, initialProductFormState, validForm())],
  ["deactivate", () => deactivateProductAction(id)],
  ["reactivate", () => reactivateProductAction(id)],
] as const)("unauthenticated %s performs no write", async (_name, invoke) => {
  boundary.requireAdmin.mockRejectedValue(authSignal);
  await expect(invoke()).rejects.toBe(authSignal);
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.update).not.toHaveBeenCalled();
  expect(boundary.setActive).not.toHaveBeenCalled();
});

test("create authenticates first, parses exact fields, revalidates, and preserves redirect control flow", async () => {
  await expect(createProductAction(initialProductFormState, validForm())).rejects.toBe(redirectSignal);
  expect(boundary.create).toHaveBeenCalledWith({
    name: "鳳梨酥",
    description: "十二入",
    imageUrl: "https://example.com/product.jpg",
    defaultPrice: 1200,
    cost: 800,
    unit: "盒",
    supplierId,
  });
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.create.mock.invocationCallOrder[0]);
  expect(boundary.revalidatePath).toHaveBeenCalledWith("/admin/products");
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/products");
});

test("update authenticates before writing and redirects after revalidation", async () => {
  await expect(updateProductAction(id, initialProductFormState, validForm())).rejects.toBe(redirectSignal);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.update.mock.invocationCallOrder[0]);
  expect(boundary.update).toHaveBeenCalledWith(id, expect.objectContaining({ defaultPrice: 1200, cost: 800 }));
  expect(boundary.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(boundary.redirect.mock.invocationCallOrder[0]);
});

test.each([["deactivate", false, deactivateProductAction], ["reactivate", true, reactivateProductAction]] as const)(
  "%s authenticates before its dedicated status write",
  async (_name, isActive, action) => {
    await expect(action(id)).rejects.toBe(redirectSignal);
    expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.setActive.mock.invocationCallOrder[0]);
    expect(boundary.setActive).toHaveBeenCalledExactlyOnceWith(id, isActive);
    expect(boundary.revalidatePath).toHaveBeenCalledWith("/admin/products");
    expect(boundary.redirect).toHaveBeenCalledWith("/admin/products");
  },
);

test.each(["invalid", "extra", "duplicate"])("invalid %s form performs no write", async (kind) => {
  const form = validForm();
  if (kind === "invalid") form.set("defaultPrice", "1e3");
  if (kind === "extra") form.set("isActive", "false");
  if (kind === "duplicate") form.append("name", "另一個名稱");
  const result = await createProductAction(initialProductFormState, form);
  expect(result.formError).toBe("請修正標示的欄位。");
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test("Supplier unavailable returns a safe field error", async () => {
  boundary.create.mockResolvedValue({ ok: false, error: "SUPPLIER_UNAVAILABLE" });
  expect(await createProductAction(initialProductFormState, validForm())).toEqual({
    fieldErrors: { supplierId: ["所選供應商不存在或已停用，請重新選擇。"] },
    formError: "請修正標示的欄位。",
  });
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test("internal form failure returns only a safe error", async () => {
  boundary.update.mockResolvedValue({ ok: false, error: "FAILED" });
  expect(await updateProductAction(id, initialProductFormState, validForm())).toEqual({
    fieldErrors: {}, formError: "儲存失敗，請稍後再試。",
  });
});

test("status failure redirects with a safe public code", async () => {
  boundary.setActive.mockResolvedValue({ ok: false, error: "FAILED" });
  await expect(deactivateProductAction(id)).rejects.toBe(redirectSignal);
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/products?error=failed");
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
});
