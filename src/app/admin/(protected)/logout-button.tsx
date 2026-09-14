"use client";

import { useFormStatus } from "react-dom";

export function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-wait disabled:opacity-60">
      {pending ? "登出中…" : "登出"}
    </button>
  );
}
