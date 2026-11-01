"use client";

import { messageStyles, titleStyles, fieldStyles, buttonStyles } from "@/components/consumer/ui/primitives";
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
    <section className="rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8">
      <h1 className={titleStyles.page}>查看訂單</h1>
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
            className={`w-full font-mono ${fieldStyles}`}
          />
        </div>
        {state.status === "error" && (
          <p role="alert" className={messageStyles.error}>{state.message}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className={buttonStyles.primary}
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
