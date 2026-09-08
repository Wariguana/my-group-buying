"use client";

import { useActionState } from "react";
import type { PublishGroupBuyState } from "./actions";

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
      className="mt-8 border-t border-zinc-300 pt-6 dark:border-zinc-700"
      onSubmit={(event) => {
        if (!window.confirm("確定要發布這個團購嗎？發布後將不能再用草稿模式編輯。")) event.preventDefault();
      }}
    >
      {state.error && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60">
        {pending ? "發布中…" : "發布團購"}
      </button>
    </form>
  );
}
