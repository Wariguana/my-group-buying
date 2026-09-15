"use client";

import { useActionState, type FormEvent } from "react";
import { buttonStyles } from "@/components/ui/primitives";
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
    return <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 font-medium text-emerald-900">{state.message}</p>;
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
        <p className="font-medium text-red-700">取貨後無法復原，且無法取消訂單。</p>
        <p className="text-sm text-slate-600">請確認商品已交付。</p>
        {state.status === "error" && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{state.message}</p>}
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} w-full`}>
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
