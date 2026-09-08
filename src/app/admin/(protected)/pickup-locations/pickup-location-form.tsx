"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PickupLocationFormState } from "./actions";

const initialPickupLocationFormState: PickupLocationFormState = {
  fieldErrors: {},
  formError: null,
};

type PickupLocationFormValues = {
  name: string;
  address: string;
  description: string | null;
};

type PickupLocationFormProps = {
  action: (state: PickupLocationFormState, formData: FormData) => Promise<PickupLocationFormState>;
  submitLabel: string;
  values?: PickupLocationFormValues;
};

const inputClassName = "w-full rounded-md border border-zinc-400 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2";

export function PickupLocationForm({ action, submitLabel, values }: PickupLocationFormProps) {
  const [state, formAction, pending] = useActionState(action, initialPickupLocationFormState);

  return (
    <form action={formAction} className="mt-8 max-w-2xl space-y-5" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        <FormField label="地點名稱" name="name" required errors={state.fieldErrors.name}>
          <input id="name" name="name" required defaultValue={values?.name} className={inputClassName} />
        </FormField>
        <FormField label="地址" name="address" required errors={state.fieldErrors.address}>
          <input id="address" name="address" required defaultValue={values?.address} className={inputClassName} />
        </FormField>
        <FormField label="說明" name="description" errors={state.fieldErrors.description}>
          <textarea id="description" name="description" rows={5} defaultValue={values?.description ?? ""} className={inputClassName} />
        </FormField>
        {state.formError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.formError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:cursor-wait disabled:opacity-60">
            {pending ? "儲存中…" : submitLabel}
          </button>
          <Link href="/admin/pickup-locations" className="rounded-md border border-zinc-400 px-4 py-2 font-medium">取消</Link>
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
  name: PickupLocationFieldName;
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

type PickupLocationFieldName = "name" | "address" | "description";
