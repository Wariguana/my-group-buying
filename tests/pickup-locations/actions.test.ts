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
vi.mock("@/lib/pickup-locations/service", () => ({
  createPickupLocation: boundary.create,
  updatePickupLocation: boundary.update,
  setPickupLocationActive: boundary.setActive,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import {
  createPickupLocationAction,
  deactivatePickupLocationAction,
  reactivatePickupLocationAction,
  updatePickupLocationAction,
} from "@/app/admin/(protected)/pickup-locations/actions";

const id = "11111111-1111-4111-8111-111111111111";
const redirectSignal = new Error("redirect control flow");
const authSignal = new Error("unauthenticated redirect");
const initialState = { fieldErrors: {}, formError: null };

function validForm() {
  const form = new FormData();
  form.set("name", "  中山取貨點  ");
  form.set("address", "  台北市  中山區  ");
  form.set("description", "  側門進入  ");
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
  ["create", () => createPickupLocationAction(initialState, validForm())],
  ["update", () => updatePickupLocationAction(id, initialState, validForm())],
  ["deactivate", () => deactivatePickupLocationAction(id)],
  ["reactivate", () => reactivatePickupLocationAction(id)],
] as const)("unauthenticated %s mutation performs no write", async (_name, invoke) => {
  boundary.requireAdmin.mockRejectedValue(authSignal);
  await expect(invoke()).rejects.toBe(authSignal);
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.update).not.toHaveBeenCalled();
  expect(boundary.setActive).not.toHaveBeenCalled();
});

test("create authenticates first, normalizes exact fields, revalidates, and preserves redirect control flow", async () => {
  await expect(createPickupLocationAction(initialState, validForm())).rejects.toBe(redirectSignal);
  expect(boundary.create).toHaveBeenCalledExactlyOnceWith({
    name: "中山取貨點",
    address: "台北市  中山區",
    description: "側門進入",
  });
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.create.mock.invocationCallOrder[0]);
  expect(boundary.revalidatePath).toHaveBeenCalledWith("/admin/pickup-locations");
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/pickup-locations");
});

test("update authenticates before writing and redirects after revalidation", async () => {
  await expect(updatePickupLocationAction(id, initialState, validForm())).rejects.toBe(redirectSignal);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.update.mock.invocationCallOrder[0]);
  expect(boundary.update).toHaveBeenCalledWith(id, {
    name: "中山取貨點",
    address: "台北市  中山區",
    description: "側門進入",
  });
  expect(boundary.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(boundary.redirect.mock.invocationCallOrder[0]);
});

test.each([
  ["deactivate", false, deactivatePickupLocationAction],
  ["reactivate", true, reactivatePickupLocationAction],
] as const)("%s authenticates before its dedicated status write", async (_name, isActive, action) => {
  await expect(action(id)).rejects.toBe(redirectSignal);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.setActive.mock.invocationCallOrder[0]);
  expect(boundary.setActive).toHaveBeenCalledExactlyOnceWith(id, isActive);
  expect(boundary.revalidatePath).toHaveBeenCalledWith("/admin/pickup-locations");
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/pickup-locations");
});

test.each(["blank", "extra", "duplicate"])("invalid %s form performs no write", async (kind) => {
  const form = validForm();
  if (kind === "blank") form.set("address", " ");
  if (kind === "extra") form.set("isActive", "false");
  if (kind === "duplicate") form.append("name", "另一個名稱");
  const result = await createPickupLocationAction(initialState, form);
  expect(result.formError).toBe("請修正標示的欄位。");
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test("internal form failure returns only a safe error", async () => {
  boundary.update.mockResolvedValue({ ok: false, error: "FAILED" });
  expect(await updatePickupLocationAction(id, initialState, validForm())).toEqual({
    fieldErrors: {},
    formError: "儲存失敗，請稍後再試。",
  });
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test("status failure redirects with a safe public code", async () => {
  boundary.setActive.mockResolvedValue({ ok: false, error: "FAILED" });
  await expect(deactivatePickupLocationAction(id)).rejects.toBe(redirectSignal);
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/pickup-locations?error=failed");
  expect(boundary.revalidatePath).not.toHaveBeenCalled();
});
