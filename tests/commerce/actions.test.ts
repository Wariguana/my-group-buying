// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), mutate: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/commerce/admin", () => ({ mutateCommerce: mocks.mutate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { commerceAction } from "@/app/admin/(protected)/commerce/actions";
beforeEach(() => vi.resetAllMocks());
test.each(["sku", "skuEdit", "category", "offer", "inventory", "group", "option", "value"])("unauthenticated/customer cannot mutate %s", async (operation) => {
  mocks.requireAdmin.mockRejectedValue(new Error("unauthorized"));
  const form = new FormData(); form.set("operation", operation);
  await expect(commerceAction({ ok: false, message: "" }, form)).rejects.toThrow("unauthorized");
  expect(mocks.mutate).not.toHaveBeenCalled();
});
test("duplicate scalar inputs fail before mutation", async () => {
  mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  const form = new FormData(); form.append("operation", "inventory"); form.append("operation", "sku");
  expect((await commerceAction({ ok: false, message: "" }, form)).ok).toBe(false);
  expect(mocks.mutate).not.toHaveBeenCalled();
});
