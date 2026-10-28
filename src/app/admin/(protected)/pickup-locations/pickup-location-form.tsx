"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PickupLocationFormState } from "./actions";
import { buttonStyles, fieldStyles, FormField } from "@/components/ui/primitives";

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

const inputClassName = fieldStyles;

export function PickupLocationForm({ action, submitLabel, values }: PickupLocationFormProps) {
  const [state, formAction, pending] = useActionState(action, initialPickupLocationFormState);

  return (
    <form action={formAction} onReset={event => event.preventDefault()} className="mt-7 max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-busy={pending}>
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
        {state.formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{state.formError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className={buttonStyles.primary}>
            {pending ? "儲存中…" : submitLabel}
          </button>
          <Link href="/admin/pickup-locations" className={buttonStyles.secondary}>取消</Link>
        </div>
      </fieldset>
    </form>
  );
}
