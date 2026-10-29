"use client";

import { useActionState, useState } from "react";
import { loginAdmin } from "@/app/admin/actions";
import { messageStyles, buttonStyles, fieldStyles } from "@/components/ui/primitives";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAdmin, { error: null });
  const [email, setEmail] = useState("");
  return (
    <form action={formAction} className="mt-7 space-y-5" aria-label="管理員登入" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-semibold text-slate-700">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)}
            aria-invalid={Boolean(state.error) || undefined} aria-describedby={state.error ? "login-error" : undefined}
            className={fieldStyles} />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-semibold text-slate-700">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required
            aria-invalid={Boolean(state.error) || undefined} aria-describedby={state.error ? "login-error" : undefined}
            className={fieldStyles} />
        </div>
        {state.error && <p id="login-error" role="alert" className={messageStyles.error}>{state.error}</p>}
        <button type="submit" disabled={pending}
          className={`${buttonStyles.primary} w-full`}>
          {pending ? "登入中…" : "登入"}
        </button>
      </fieldset>
    </form>
  );
}
