"use client";

import { useFormStatus } from "react-dom";

export function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="rounded-md border border-zinc-400 px-4 py-2 text-sm disabled:cursor-wait disabled:opacity-60">
      {pending ? "登出中…" : "登出"}
    </button>
  );
}
