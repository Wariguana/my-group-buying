"use client";

import { useActionState, type FormEvent } from "react";
import { submitCancelOrderAction } from "./cancel-actions";
import {
  initialCancelOrderActionState,
  type CancelOrderActionState,
} from "./cancel-action-state";

type CancelOrderFormViewProps = Readonly<{
  publicCode: string;
  state: CancelOrderActionState;
  pending: boolean;
  formAction: (formData: FormData) => void;
}>;

export function CancelOrderFormView({
  publicCode,
  state,
  pending,
  formAction,
}: CancelOrderFormViewProps) {
  if (state.status === "success") {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 p-4 font-medium text-emerald-900">
        {state.message}
      </p>
    );
  }

  function confirmCancellation(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("取消後無法復原，確定要取消訂單嗎？")) {
      event.preventDefault();
    }
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      onSubmit={confirmCancellation}
      className="space-y-4"
    >
      <input type="hidden" name="publicCode" value={publicCode} />
      <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
        <p className="font-medium text-red-800">取消後無法復原。</p>
        {state.status === "error" && (
          <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{state.message}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-700 px-5 py-3 font-bold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "取消處理中…" : "取消訂單"}
        </button>
      </fieldset>
    </form>
  );
}

export function CancelOrderForm({ publicCode }: Readonly<{ publicCode: string }>) {
  const [state, formAction, pending] = useActionState(
    submitCancelOrderAction,
    initialCancelOrderActionState,
  );
  return (
    <CancelOrderFormView
      publicCode={publicCode}
      state={state}
      pending={pending}
      formAction={formAction}
    />
  );
}
