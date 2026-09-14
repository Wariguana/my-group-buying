"use client";

import { useActionState, type FormEvent } from "react";
import { submitAdminCancelOrderAction } from "./cancel-actions";
import {
  initialAdminCancelOrderActionState,
  type AdminCancelOrderActionState,
} from "./cancel-action-state";

type Props = Readonly<{
  publicCode: string;
  state: AdminCancelOrderActionState;
  pending: boolean;
  formAction: (formData: FormData) => void;
}>;

export function AdminCancelOrderFormView({ publicCode, state, pending, formAction }: Props) {
  if (state.status === "success") {
    return <p role="status" className="rounded-md bg-emerald-50 p-4 font-medium text-emerald-900">{state.message}</p>;
  }

  function confirmCancellation(event: FormEvent<HTMLFormElement>) {
    if (pending || !window.confirm("取消後無法復原，確定要取消訂單嗎？")) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} aria-busy={pending} onSubmit={confirmCancellation} className="space-y-4">
      <input type="hidden" name="publicCode" value={publicCode} />
      <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
        <p className="font-medium text-red-700 dark:text-red-400">取消後無法復原。</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">管理員可在團購截止後取消訂單。</p>
        {state.status === "error" && <p role="alert" className="text-red-700 dark:text-red-400">{state.message}</p>}
        <button type="submit" disabled={pending} className="rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60">
          {pending ? "取消處理中…" : "取消訂單"}
        </button>
      </fieldset>
    </form>
  );
}

export function AdminCancelOrderForm({ publicCode }: Readonly<{ publicCode: string }>) {
  const [state, formAction, pending] = useActionState(
    submitAdminCancelOrderAction,
    initialAdminCancelOrderActionState,
  );
  return <AdminCancelOrderFormView publicCode={publicCode} state={state} formAction={formAction} pending={pending} />;
}
