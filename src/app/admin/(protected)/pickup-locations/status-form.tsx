"use client";

import { useFormStatus } from "react-dom";

export function PickupLocationStatusForm({
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
        if (isActive && !window.confirm("確定要停用這個取貨地點嗎？")) event.preventDefault();
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
      className="rounded-md border border-zinc-400 px-3 py-1.5 text-sm font-medium disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "處理中…" : isActive ? "停用" : "啟用"}
    </button>
  );
}
