"use client";

import { useActionState } from "react";
import { loginAdmin } from "@/app/admin/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAdmin, { error: null });
  return (
    <form action={formAction} className="mt-8 space-y-5" aria-label="管理員登入" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required
            className="w-full rounded-md border border-zinc-400 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2" />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required
            className="w-full rounded-md border border-zinc-400 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2" />
        </div>
        <p id="login-error" role="alert" className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
        <button type="submit" disabled={pending}
          className="w-full rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:cursor-wait disabled:opacity-60">
          {pending ? "登入中…" : "登入"}
        </button>
      </fieldset>
    </form>
  );
}
