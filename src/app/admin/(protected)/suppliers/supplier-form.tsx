"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { SupplierFormState } from "./actions";

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

const inputClassName = "w-full rounded-md border border-zinc-400 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2";

export function SupplierForm({ action, submitLabel, values }: SupplierFormProps) {
  const [state, formAction, pending] = useActionState(action, initialSupplierFormState);

  return (
    <form action={formAction} className="mt-8 max-w-2xl space-y-5" aria-busy={pending}>
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
        {state.formError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.formError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:cursor-wait disabled:opacity-60">
            {pending ? "儲存中…" : submitLabel}
          </button>
          <Link href="/admin/suppliers" className="rounded-md border border-zinc-400 px-4 py-2 font-medium">取消</Link>
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
      <label htmlFor={name} className="block text-sm font-medium">{label}{required ? " *" : ""}</label>
      {children}
      {errors?.map((error) => <p id={errorId} key={error} className="text-sm text-red-700 dark:text-red-400">{error}</p>)}
    </div>
  );
}

type SupplierFieldName = "name" | "contactName" | "phone" | "lineContact" | "note";
