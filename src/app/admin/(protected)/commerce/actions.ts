"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mutateCommerce } from "@/lib/commerce/admin";

export async function commerceAction(_state: { message: string; ok: boolean }, form: FormData) {
  const admin = await requireAdmin();
  try {
    const entries = [...form.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
    const repeated = ["optionValueIds", "shippingMethods"];
    const singleKeys = entries.map(([key]) => key).filter((key) => !repeated.includes(key));
    if (new Set(singleKeys).size !== singleKeys.length) throw new ZodError([]);
    const input: Record<string, unknown> = Object.fromEntries(entries);
    for (const key of repeated) if (form.has(key) || key === "shippingMethods" && input.operation === "skuEdit") input[key] = form.getAll(key);
    for (const key of ["categoryId", "purchaseLimit", "weightGrams", "lengthMm", "widthMm", "heightMm"]) if (input[key] === "") input[key] = null;
    if (input.id === "") delete input.id;
    await mutateCommerce(input, admin.id);
  } catch (error) {
    const message = error instanceof ZodError ? "欄位無效，請檢查必填、數量及格式。"
      : error instanceof Prisma.PrismaClientKnownRequestError ? "無法儲存：資料重複、關聯不正確或狀態已變更。請重新整理。"
      : error instanceof Error && !error.message.includes("\n") ? error.message : "儲存失敗，請稍後重試。";
    return { ok: false, message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "已儲存。" };
}
