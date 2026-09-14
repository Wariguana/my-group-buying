"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { SupplierFormState } from "./actions";
import { buttonStyles, fieldStyles } from "@/components/ui/primitives";

const initialSupplierFormState: SupplierFormState = {
  fieldErrors: {},
  formError: null,
};

type SupplierFormValues = {
  name: string;
  contactName: string | null;
  phone: string | null;
  lineContact: string | null;
  note: string | null;
};

type SupplierFormProps = {
  action: (state: SupplierFormState, formData: FormData) => Promise<SupplierFormState>;
  submitLabel: string;
  values?: SupplierFormValues;
};

const inputClassName = fieldStyles;

export function SupplierForm({ action, submitLabel, values }: SupplierFormProps) {
  const [state, formAction, pending] = useActionState(action, initialSupplierFormState);

  return (
    <form action={formAction} className="mt-7 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        <FormField label="供應商名稱" name="name" required errors={state.fieldErrors.name}>
          <input id="name" name="name" required defaultValue={values?.name} className={inputClassName} />
        </FormField>
        <FormField label="聯絡人" name="contactName" errors={state.fieldErrors.contactName}>
          <input id="contactName" name="contactName" defaultValue={values?.contactName ?? ""} className={inputClassName} />
        </FormField>
        <FormField label="電話" name="phone" errors={state.fieldErrors.phone}>
          <input id="phone" name="phone" type="tel" defaultValue={values?.phone ?? ""} className={inputClassName} />
        </FormField>
        <FormField label="LINE / 聯絡方式" name="lineContact" errors={state.fieldErrors.lineContact}>
          <input id="lineContact" name="lineContact" defaultValue={values?.lineContact ?? ""} className={inputClassName} />
        </FormField>
        <FormField label="備註" name="note" errors={state.fieldErrors.note}>
          <textarea id="note" name="note" rows={5} defaultValue={values?.note ?? ""} className={inputClassName} />
        </FormField>
        {state.formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{state.formError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className={buttonStyles.primary}>
            {pending ? "儲存中…" : submitLabel}
          </button>
          <Link href="/admin/suppliers" className={buttonStyles.secondary}>取消</Link>
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
  name: SupplierFieldName;
  required?: boolean;
  errors?: string[];
  children: React.ReactNode;
}) {
  const errorId = `${name}-error`;
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-semibold text-slate-700">{label}{required ? " *" : ""}</label>
      {children}
      {errors?.map((error) => <p id={errorId} role="alert" key={error} className="text-sm font-medium text-red-700">{error}</p>)}
    </div>
  );
}

type SupplierFieldName = "name" | "contactName" | "phone" | "lineContact" | "note";
