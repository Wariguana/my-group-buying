"use client";

import { useActionState, type ReactNode } from "react";
import { commerceAction } from "./actions";
import { buttonStyles } from "@/components/ui/primitives";

export function CommerceForm({ operation, children, confirm = false }: { operation: string; children: ReactNode; confirm?: boolean }) {
  const [state, action, pending] = useActionState(commerceAction, { ok: false, message: "" });
  return <form action={action} className="my-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    onSubmit={(event) => { if (confirm && !window.confirm("確認執行此變更？庫存調整會留下永久紀錄。")) event.preventDefault(); }}>
    <input type="hidden" name="operation" value={operation} />
    <fieldset disabled={pending} className="flex flex-wrap items-end gap-3 disabled:opacity-60">{children}
      <button className={buttonStyles.primary} disabled={pending}>{pending ? "儲存中…" : "儲存"}</button>
    </fieldset>
    {state.message && !pending && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-green-800" : "text-red-800"}>{state.message}</p>}
  </form>;
}
