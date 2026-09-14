"use client";

import { useActionState } from "react";
import { loginAdmin } from "@/app/admin/actions";
import { fieldStyles } from "@/components/ui/primitives";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAdmin, { error: null });
  return (
    <form action={formAction} className="mt-7 space-y-5" aria-label="管理員登入" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-semibold text-slate-700">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required
            className={fieldStyles} />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-semibold text-slate-700">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required
            className={fieldStyles} />
        </div>
        {state.error && <p id="login-error" role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{state.error}</p>}
        <button type="submit" disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-wait disabled:opacity-60">
          {pending ? "登入中…" : "登入"}
        </button>
      </fieldset>
    </form>
  );
}
