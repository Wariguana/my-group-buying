"use server";
import { validateCart } from "@/lib/commerce/public";

export async function revalidateCartAction(input: unknown) {
  try { return { ok: true as const, value: await validateCart(input) }; }
  catch { return { ok: false as const, error: "無法驗證購物車，請檢查資料或稍後重試。" }; }
}
