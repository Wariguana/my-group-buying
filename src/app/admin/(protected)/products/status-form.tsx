"use client";

import { useFormStatus } from "react-dom";
import { buttonStyles } from "@/components/ui/primitives";

export function ProductStatusForm({
  action,
  isActive,
}: {
  action: () => Promise<void>;
  isActive: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (isActive && !window.confirm("確定要停用這個商品嗎？")) event.preventDefault();
      }}
    >
      <StatusButton isActive={isActive} />
    </form>
  );
}

function StatusButton({ isActive }: { isActive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={isActive ? buttonStyles.danger : buttonStyles.secondary}
    >
      {pending ? "處理中…" : isActive ? "停用" : "啟用"}
    </button>
  );
}
