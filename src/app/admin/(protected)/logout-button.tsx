"use client";

import { useFormStatus } from "react-dom";
import { buttonStyles } from "@/components/ui/primitives";

export function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      aria-busy={pending}
      className={`${buttonStyles.secondary} shrink-0 whitespace-nowrap`}>
      {pending ? "登出中…" : "登出"}
    </button>
  );
}
