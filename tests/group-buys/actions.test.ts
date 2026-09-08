// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import { beforeEach, expect, test, vi } from "vitest";

const boundary = vi.hoisted(() => ({ requireAdmin: vi.fn(), create: vi.fn(), update: vi.fn(), publish: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.requireAdmin }));
vi.mock("@/lib/group-buys/service", () => ({ createGroupBuyDraft: boundary.create, updateGroupBuyDraft: boundary.update, publishGroupBuy: boundary.publish }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import { createGroupBuyDraftAction, publishGroupBuyAction, updateGroupBuyDraftAction } from "@/app/admin/(protected)/group-buys/actions";

const id = "11111111-1111-4111-8111-111111111111";
const initialState = { fieldErrors: {}, formError: null };
const redirectSignal = new Error("redirect");
const authSignal = new Error("auth");

function validForm() {
  const form = new FormData();
  form.set("title", " 團購 ");
  form.set("description", " ");
  form.set("coverImageUrl", "");
  form.set("startAt", "2026-09-01T10:00");
  form.set("endAt", "2026-09-02T10:00");
  form.set("items", "[]");
  form.set("pickups", "[]");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.requireAdmin.mockResolvedValue({ id: "admin" });
  boundary.create.mockResolvedValue({ ok: true, value: { id } });
  boundary.update.mockResolvedValue({ ok: true, value: { id } });
  boundary.publish.mockResolvedValue({ ok: true, value: { id } });
  boundary.redirect.mockImplementation(() => { throw redirectSignal; });
});

test("unauthenticated publish performs no service mutation", async () => {
  boundary.requireAdmin.mockRejectedValue(authSignal);
  await expect(publishGroupBuyAction(id, { error: null }, new FormData())).rejects.toBe(authSignal);
  expect(boundary.publish).not.toHaveBeenCalled();
});

test("invalid publish ID is rejected after auth without service mutation", async () => {
  expect(await publishGroupBuyAction("bad", { error: null }, new FormData())).toEqual({ error: "團購資料無效。" });
  expect(boundary.requireAdmin).toHaveBeenCalledTimes(1);
  expect(boundary.publish).not.toHaveBeenCalled();
});

test("successful publish authenticates before mutation, revalidates, and preserves redirect control flow", async () => {
  await expect(publishGroupBuyAction(id, { error: null }, new FormData())).rejects.toBe(redirectSignal);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.publish.mock.invocationCallOrder[0]);
  expect(boundary.publish).toHaveBeenCalledWith(id);
  expect(boundary.revalidatePath).toHaveBeenCalledWith("/admin/group-buys");
  expect(boundary.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(boundary.redirect.mock.invocationCallOrder[0]);
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/group-buys");
});

test.each([
  ["PUBLISH_NO_ITEMS", "請先加入至少一項商品。"],
  ["PUBLISH_ITEM_UNAVAILABLE", "團購包含已停用或不可用的商品，請移除或重新啟用後再發布。"],
  ["PUBLISH_NO_PICKUPS", "請先加入至少一個取貨地點。"],
  ["PUBLISH_PICKUP_UNAVAILABLE", "團購包含已停用或不可用的取貨地點，請移除或重新啟用後再發布。"],
  ["PUBLISH_ORDERING_ENDED", "訂購截止時間必須晚於目前時間。"],
  ["PUBLISH_PICKUP_BEFORE_ORDER_END", "取貨開始時間不可早於訂購截止時間。"],
  ["NOT_PUBLISHABLE", "此團購已發布、已取消，或狀態已變更，無法發布。"],
  ["FAILED", "發布失敗，請稍後再試。"],
] as const)("maps publish %s to a safe message", async (error, message) => {
  boundary.publish.mockResolvedValue({ ok: false, error });
  expect(await publishGroupBuyAction(id, { error: null }, new FormData())).toEqual({ error: message });
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test("publish UI and source stay within Phase 1 boundaries", async () => {
  const [editPage, publishForm, service, appFiles] = await Promise.all([
    readFile(new URL("../../src/app/admin/(protected)/group-buys/[id]/edit/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/app/admin/(protected)/group-buys/publish-group-buy-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/lib/group-buys/service.ts", import.meta.url), "utf8"),
    readdir(new URL("../../src/app/", import.meta.url), { recursive: true }),
  ]);
  expect(editPage).toMatch(/status !== "DRAFT"/);
  expect(editPage).toMatch(/<PublishGroupBuyForm/);
  expect(publishForm).toContain("發布團購");
  expect(publishForm).toContain("確定要發布這個團購嗎？發布後將不能再用草稿模式編輯。");
  expect(service).not.toMatch(/groupBuy\.delete(?:Many)?\s*\(/);
  expect(publishForm).not.toMatch(/取消團購|cancelGroupBuy/);
  expect(appFiles.map((file) => file.replaceAll("\\", "/"))).not.toContain(expect.stringMatching(/group-buys\/.*(?:public|cancel)/));
});

test.each([
  ["create", () => createGroupBuyDraftAction(initialState, validForm())],
  ["update", () => updateGroupBuyDraftAction(id, initialState, validForm())],
] as const)("unauthenticated %s performs no service mutation", async (_name, invoke) => {
  boundary.requireAdmin.mockRejectedValue(authSignal);
  await expect(invoke()).rejects.toBe(authSignal);
  expect(boundary.create).not.toHaveBeenCalled();
  expect(boundary.update).not.toHaveBeenCalled();
});

test.each(["items", "pickups"])("malformed %s JSON never reaches the service", async (field) => {
  const form = validForm();
  form.set(field, "{");
  expect((await createGroupBuyDraftAction(initialState, form)).formError).toBe("請修正標示的欄位。");
  expect(boundary.create).not.toHaveBeenCalled();
});

test("strict invalid top-level form never reaches the service", async () => {
  const form = validForm();
  form.set("status", "PUBLISHED");
  expect((await createGroupBuyDraftAction(initialState, form)).formError).toBe("請修正標示的欄位。");
  expect(boundary.create).not.toHaveBeenCalled();
});

test("successful create authenticates, revalidates, and preserves redirect control flow", async () => {
  await expect(createGroupBuyDraftAction(initialState, validForm())).rejects.toBe(redirectSignal);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.create.mock.invocationCallOrder[0]);
  expect(boundary.create).toHaveBeenCalledWith(expect.objectContaining({ title: "團購", items: [], pickups: [] }));
  expect(boundary.revalidatePath).toHaveBeenCalledWith("/admin/group-buys");
  expect(boundary.redirect).toHaveBeenCalledWith("/admin/group-buys");
});

test("successful update authenticates and redirects after revalidation", async () => {
  await expect(updateGroupBuyDraftAction(id, initialState, validForm())).rejects.toBe(redirectSignal);
  expect(boundary.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(boundary.update.mock.invocationCallOrder[0]);
  expect(boundary.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(boundary.redirect.mock.invocationCallOrder[0]);
});

test.each([
  ["NOT_EDITABLE", "此團購目前不可用草稿模式編輯。"],
  ["FAILED", "儲存失敗，請稍後再試。"],
] as const)("maps %s to a safe message", async (error, message) => {
  boundary.update.mockResolvedValue({ ok: false, error });
  expect((await updateGroupBuyDraftAction(id, initialState, validForm())).formError).toBe(message);
  expect(boundary.redirect).not.toHaveBeenCalled();
});

test.each([
  ["PRODUCT_UNAVAILABLE", "items"],
  ["PICKUP_LOCATION_UNAVAILABLE", "pickups"],
] as const)("maps %s to a safe aggregate field error", async (error, field) => {
  boundary.create.mockResolvedValue({ ok: false, error });
  const result = await createGroupBuyDraftAction(initialState, validForm());
  expect(result.fieldErrors[field]).toHaveLength(1);
  expect(boundary.redirect).not.toHaveBeenCalled();
});
