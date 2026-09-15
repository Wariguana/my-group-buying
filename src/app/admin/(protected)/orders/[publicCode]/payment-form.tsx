"use client";

import { useActionState, type FormEvent } from "react";
import { buttonStyles } from "@/components/ui/primitives";
import { submitAdminPaymentOrderAction } from "./payment-actions";
import {
  initialAdminPaymentOrderActionState,
  type AdminPaymentOrderActionState,
} from "./payment-action-state";

type Props = Readonly<{
  publicCode: string;
  totalAmount: number;
  state: AdminPaymentOrderActionState;
  pending: boolean;
  formAction: (formData: FormData) => void;
}>;

export function AdminPaymentOrderFormView({ publicCode, totalAmount, state, pending, formAction }: Props) {
  if (state.status === "success") {
    return <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 font-medium text-emerald-900">{state.message}</p>;
  }

  const amount = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(totalAmount);

  function confirmPayment(event: FormEvent<HTMLFormElement>) {
    if (pending || !window.confirm(`請確認已全額收款 ${amount}。確認後無法復原，且無法取消訂單，確定要確認已收款嗎？`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} aria-busy={pending} onSubmit={confirmPayment} className="space-y-4">
      <input type="hidden" name="publicCode" value={publicCode} />
      <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
        <p className="font-medium">應收總額：{amount}</p>
        <p className="font-medium text-red-700">收款後無法復原，且無法取消訂單。</p>
        <p className="text-sm text-slate-600">請確認已收到訂單全額款項。</p>
        {state.status === "error" && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{state.message}</p>}
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} w-full`}>
          {pending ? "收款處理中…" : "確認已收款"}
        </button>
      </fieldset>
    </form>
  );
}

export function AdminPaymentOrderForm({ publicCode, totalAmount }: Readonly<{ publicCode: string; totalAmount: number }>) {
  const [state, formAction, pending] = useActionState(
    submitAdminPaymentOrderAction,
    initialAdminPaymentOrderActionState,
  );
  return <AdminPaymentOrderFormView publicCode={publicCode} totalAmount={totalAmount} state={state} formAction={formAction} pending={pending} />;
}
