"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  createProduct,
  setProductActive,
  updateProduct,
  type ProductErrorCode,
} from "@/lib/products/service";
import {
  createProductSchema,
  productStatusMutationSchema,
  updateProductSchema,
} from "@/lib/products/validation";

type ProductField =
  | "name"
  | "description"
  | "imageUrl"
  | "defaultPrice"
  | "cost"
  | "unit"
  | "supplierId";

export type ProductFormState = {
  fieldErrors: Partial<Record<ProductField, string[]>>;
  formError: string | null;
};

function formDataInput(formData: FormData): unknown {
  const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  return Object.fromEntries(entries);
}

function validationState(error: { flatten(): { fieldErrors: Record<string, string[]> } }): ProductFormState {
  return {
    fieldErrors: error.flatten().fieldErrors,
    formError: "請修正標示的欄位。",
  };
}

function serviceFailure(error: ProductErrorCode): ProductFormState {
  if (error === "NOT_FOUND") return { fieldErrors: {}, formError: "找不到商品。" };
  if (error === "SUPPLIER_UNAVAILABLE") {
    return {
      fieldErrors: { supplierId: ["所選供應商不存在或已停用，請重新選擇。"] },
      formError: "請修正標示的欄位。",
    };
  }
  if (error === "INVALID_INPUT") return { fieldErrors: {}, formError: "輸入資料無效。" };
  return { fieldErrors: {}, formError: "儲存失敗，請稍後再試。" };
}

export async function createProductAction(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();
  const parsed = createProductSchema.safeParse(formDataInput(formData));
  if (!parsed.success) return validationState(parsed.error);

  const result = await createProduct(parsed.data);
  if (!result.ok) return serviceFailure(result.error);

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateProductAction(
  id: string,
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();
  const parsed = updateProductSchema.safeParse(formDataInput(formData));
  if (!parsed.success) return validationState(parsed.error);

  const result = await updateProduct(id, parsed.data);
  if (!result.ok) return serviceFailure(result.error);

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

async function setProductStatusAction(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  const parsed = productStatusMutationSchema.safeParse({ id, isActive });
  if (!parsed.success) redirect("/admin/products?error=not-found");

  const result = await setProductActive(parsed.data.id, parsed.data.isActive);
  if (!result.ok) {
    const error = result.error === "FAILED" ? "failed" : "not-found";
    redirect(`/admin/products?error=${error}`);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function deactivateProductAction(id: string): Promise<void> {
  return setProductStatusAction(id, false);
}

export async function reactivateProductAction(id: string): Promise<void> {
  return setProductStatusAction(id, true);
}
