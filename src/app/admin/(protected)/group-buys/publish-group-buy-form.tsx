"use client";

import { useActionState } from "react";
import type { PublishGroupBuyState } from "./actions";
import { buttonStyles } from "@/components/ui/primitives";

const initialState: PublishGroupBuyState = { error: null };

export function PublishGroupBuyForm({
  action,
}: {
  action: (state: PublishGroupBuyState, formData: FormData) => Promise<PublishGroupBuyState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5"
      onSubmit={(event) => {
        if (!window.confirm("確定要發布這個團購嗎？")) event.preventDefault();
      }}
    >
      <h2 className="font-bold text-emerald-950">準備發布</h2>
      <p className="mt-1 mb-4 text-sm text-emerald-900">發布前請確認商品、取貨地點與時間皆已正確設定。</p>
      {state.error && <p role="alert" className="mb-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className={buttonStyles.primary}>
        {pending ? "發布中…" : "發布團購"}
      </button>
    </form>
  );
}
