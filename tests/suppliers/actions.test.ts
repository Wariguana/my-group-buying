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
vi.mock("@/lib/suppliers/service", () => ({
  createSupplier: boundary.create,
  updateSupplier: boundary.update,
  setSupplierActive: boundary.setActive,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import {
  createSupplierAction,
  deactivateSupplierAction,
  reactivateSupplierAction,
  updateSupplierAction,
} from "@/app/admin/(protected)/suppliers/actions";

const id = "11111111-1111-4111-8111-111111111111";
const redirectSignal = new Error("redirect control flow");
const authSignal = new Error("unauthenticated redirect");
const initialSupplierFormState = { fieldErrors: {}, formError: null };

function validForm() {
  const form = new FormData();
  form.set("name", "  供應商甲  ");
  form.set("contactName", "  王小明  ");
  form.set("phone", " ");
  form.set("lineContact", "  line-id  ");
  form.set("note", " ");
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
  ["create", () => createSupplierAction(initialSupplierFormState, validForm())],
  ["update", () => updateSupplierAction(id, initialSupplierFormState, validForm())],
  ["deactivate", () => deactivateSupplierAction(id)],
  ["reactivate", () => reactivateSupplierAction(id)],
] as const)("unauthenticated %s mutation performs no write", async (_name, invoke) => {
  boundary.requireAdmin.mockRejectedValue(authSignal);
  await expect(invoke()).rejects.toBe(authSignal);
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.update).not.toHaveBeenCalled();
  expect(boundary.setActive).not.toHaveBeenCalled();
});

test("create authenticates before writing, normalizes input, revalidates, and does not swallow redirect", async () => {
  await expect(createSupplierAction(initialSupplierFormState, validForm())).rejects.toBe(redirectSignal);
  expect(boundary.create).toHaveBeenCalledWith({
    name: "供應商甲",
    contactName: "王小明",
    phone: null,
    lineContact: "line-id",
    note: null,
  });
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.create.mock.invocationCallOrder[0]);
  expect(boundary.revalidatePath).toHaveBeenCalledWith("/admin/suppliers");
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/suppliers");
});

test("update authenticates before writing and redirects after revalidation", async () => {
  await expect(updateSupplierAction(id, initialSupplierFormState, validForm())).rejects.toBe(redirectSignal);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.update.mock.invocationCallOrder[0]);
  expect(boundary.update).toHaveBeenCalledWith(id, expect.objectContaining({ name: "供應商甲" }));
  expect(boundary.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(boundary.redirect.mock.invocationCallOrder[0]);
});

test.each([["deactivate", false, deactivateSupplierAction], ["reactivate", true, reactivateSupplierAction]] as const)(
  "%s authenticates before the dedicated status write",
  async (_name, isActive, action) => {
    await expect(action(id)).rejects.toBe(redirectSignal);
    expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.setActive.mock.invocationCallOrder[0]);
    expect(boundary.setActive).toHaveBeenCalledExactlyOnceWith(id, isActive);
    expect(boundary.revalidatePath).toHaveBeenCalledWith("/admin/suppliers");
    expect(boundary.redirect).toHaveBeenCalledWith("/admin/suppliers");
  },
);

test.each(["blank", "extra", "duplicate"])("invalid %s form input performs no write", async (kind) => {
  const form = validForm();
  if (kind === "blank") form.set("name", " ");
  if (kind === "extra") form.set("isActive", "false");
  if (kind === "duplicate") form.append("name", "another");
  const result = await createSupplierAction(initialSupplierFormState, form);
  expect(result.formError).toBe("請修正標示的欄位。");
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test("create internal failure returns only a safe error", async () => {
  boundary.create.mockResolvedValue({ ok: false, error: "FAILED" });
  expect(await createSupplierAction(initialSupplierFormState, validForm())).toEqual({
    fieldErrors: {},
    formError: "儲存失敗，請稍後再試。",
  });
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test("status internal failure redirects with a safe public code", async () => {
  boundary.setActive.mockResolvedValue({ ok: false, error: "FAILED" });
  await expect(deactivateSupplierAction(id)).rejects.toBe(redirectSignal);
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/suppliers?error=failed");
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
});
