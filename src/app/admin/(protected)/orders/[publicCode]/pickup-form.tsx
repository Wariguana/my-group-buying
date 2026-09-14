"use client";

import { useActionState, type FormEvent } from "react";
import { submitAdminPickupOrderAction } from "./pickup-actions";
import {
  initialAdminPickupOrderActionState,
  type AdminPickupOrderActionState,
} from "./pickup-action-state";

type Props = Readonly<{
  publicCode: string;
  state: AdminPickupOrderActionState;
  pending: boolean;
  formAction: (formData: FormData) => void;
}>;

export function AdminPickupOrderFormView({ publicCode, state, pending, formAction }: Props) {
  if (state.status === "success") {
    return <p role="status" className="rounded-md bg-emerald-50 p-4 font-medium text-emerald-900">{state.message}</p>;
  }

  function confirmPickup(event: FormEvent<HTMLFormElement>) {
    if (pending || !window.confirm("取貨後無法復原，且無法取消訂單，確定要標記已取貨嗎？")) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} aria-busy={pending} onSubmit={confirmPickup} className="space-y-4">
      <input type="hidden" name="publicCode" value={publicCode} />
      <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
        <p className="font-medium text-red-700 dark:text-red-400">取貨後無法復原，且無法取消訂單。</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">請確認商品已交付。</p>
        {state.status === "error" && <p role="alert" className="text-red-700 dark:text-red-400">{state.message}</p>}
        <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">
          {pending ? "取貨處理中…" : "標記已取貨"}
        </button>
      </fieldset>
    </form>
  );
}

export function AdminPickupOrderForm({ publicCode }: Readonly<{ publicCode: string }>) {
  const [state, formAction, pending] = useActionState(
    submitAdminPickupOrderAction,
    initialAdminPickupOrderActionState,
  );
  return <AdminPickupOrderFormView publicCode={publicCode} state={state} formAction={formAction} pending={pending} />;
}
