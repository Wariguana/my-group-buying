"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ProductFormState } from "./actions";

const initialProductFormState: ProductFormState = {
  fieldErrors: {},
  formError: null,
};

type ProductFormValues = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  defaultPrice: number;
  cost: number;
  unit: string;
  supplierId: string | null;
};

type SupplierOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type ProductFormProps = {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  submitLabel: string;
  supplierOptions: SupplierOption[];
  values?: ProductFormValues;
};

const inputClassName = "w-full rounded-md border border-zinc-400 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2";

export function ProductForm({ action, submitLabel, supplierOptions, values }: ProductFormProps) {
  const [state, formAction, pending] = useActionState(action, initialProductFormState);

  return (
    <form action={formAction} className="mt-8 max-w-2xl space-y-5" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        <FormField label="商品名稱" name="name" required errors={state.fieldErrors.name}>
          <input id="name" name="name" required defaultValue={values?.name} className={inputClassName} />
        </FormField>
        <FormField label="商品說明" name="description" errors={state.fieldErrors.description}>
          <textarea id="description" name="description" rows={5} defaultValue={values?.description ?? ""} className={inputClassName} />
        </FormField>
        <FormField label="圖片網址" name="imageUrl" errors={state.fieldErrors.imageUrl}>
          <input id="imageUrl" name="imageUrl" type="url" inputMode="url" placeholder="https://example.com/product.jpg" defaultValue={values?.imageUrl ?? ""} className={inputClassName} />
        </FormField>
        <FormField label="預設售價" name="defaultPrice" required errors={state.fieldErrors.defaultPrice}>
          <input id="defaultPrice" name="defaultPrice" type="number" inputMode="numeric" min="0" max="2147483647" step="1" required defaultValue={values?.defaultPrice} className={inputClassName} />
        </FormField>
        <FormField label="預設成本" name="cost" required errors={state.fieldErrors.cost}>
          <input id="cost" name="cost" type="number" inputMode="numeric" min="0" max="2147483647" step="1" required defaultValue={values?.cost} className={inputClassName} />
        </FormField>
        <FormField label="單位" name="unit" required errors={state.fieldErrors.unit}>
          <input id="unit" name="unit" required placeholder="例如：包、盒、瓶、件" defaultValue={values?.unit} className={inputClassName} />
        </FormField>
        <FormField label="供應商" name="supplierId" errors={state.fieldErrors.supplierId}>
          <select id="supplierId" name="supplierId" defaultValue={values?.supplierId ?? ""} className={inputClassName}>
            <option value="">未指定供應商</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}{supplier.isActive ? "" : "（已停用）"}
              </option>
            ))}
          </select>
        </FormField>
        {state.formError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.formError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:cursor-wait disabled:opacity-60">
            {pending ? "儲存中…" : submitLabel}
          </button>
          <Link href="/admin/products" className="rounded-md border border-zinc-400 px-4 py-2 font-medium">取消</Link>
        </div>
      </fieldset>
    </form>
  );
}

function FormField({
  label,
  name,
  required = false,
  errors,
  children,
}: {
  label: string;
  name: ProductFieldName;
  required?: boolean;
  errors?: string[];
  children: React.ReactNode;
}) {
  const errorId = `${name}-error`;
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-medium">{label}{required ? " *" : ""}</label>
      {children}
      {errors?.map((error) => <p id={errorId} key={error} className="text-sm text-red-700 dark:text-red-400">{error}</p>)}
    </div>
  );
}

type ProductFieldName = "name" | "description" | "imageUrl" | "defaultPrice" | "cost" | "unit" | "supplierId";
