"use client";

import { useActionState } from "react";
import { submitOrderAccessAction } from "./actions";
import {
  initialOrderAccessActionState,
  type OrderAccessActionState,
} from "./access-action-state";

type OrderAccessFormViewProps = Readonly<{
  publicCode: string;
  state: OrderAccessActionState;
  pending: boolean;
  formAction: (formData: FormData) => void;
}>;

export function OrderAccessFormView({
  publicCode,
  state,
  pending,
  formAction,
}: OrderAccessFormViewProps) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-bold">查看訂單</h1>
      <p className="mt-3 text-stone-600">訂單參考編號：<strong>{publicCode}</strong></p>
      <p className="mt-2 text-sm text-stone-600">請輸入訂購成功時顯示的訂單管理碼。</p>
      <form action={formAction} aria-busy={pending} className="mt-6 space-y-4">
        <input type="hidden" name="publicCode" value={publicCode} />
        <div className="space-y-2">
          <label htmlFor="managementCode" className="block font-medium">訂單管理碼</label>
          <input
            id="managementCode"
            name="managementCode"
            required
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:bg-stone-100"
          />
        </div>
        {state.status === "error" && (
          <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{state.message}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-amber-800 px-5 py-3 font-bold text-white hover:bg-amber-900 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "驗證中…" : "查看訂單"}
        </button>
      </form>
    </section>
  );
}

export function OrderAccessForm({ publicCode }: Readonly<{ publicCode: string }>) {
  const [state, formAction, pending] = useActionState(
    submitOrderAccessAction,
    initialOrderAccessActionState,
  );
  return (
    <OrderAccessFormView
      publicCode={publicCode}
      state={state}
      pending={pending}
      formAction={formAction}
    />
  );
}
