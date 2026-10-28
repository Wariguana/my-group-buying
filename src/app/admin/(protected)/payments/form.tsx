"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseTaipeiDateTimeLocal } from "@/lib/group-buys/time";
import { labels } from "@/lib/qbuy/domain";
import { readJsonResponse } from "@/lib/http/client-json";
import { buttonStyles, fieldStyles } from "@/components/ui/primitives";
export type Field = { name: string; label: string; type?: string; value?: string | number; options?: readonly string[]; required?: boolean };
export function OperationForm({ operation, checkoutId, fields, label, confirmMessage }: { operation: string; checkoutId?: string; fields: Field[]; label: string; confirmMessage?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const router = useRouter();
  return <form aria-label={label} aria-busy={busy} className="space-y-3 rounded-xl border bg-white p-4" onSubmit={async e => {
    e.preventDefault();
    if (submitting.current) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const f = new FormData(e.currentTarget);
    submitting.current = true; setBusy(true); setMessage(""); setFailed(false);
    try {
      const data: Record<string, unknown> = {};
      for (const field of fields) {
        const value = f.get(field.name);
        if (field.type === "datetime-local") {
          const date = parseTaipeiDateTimeLocal(String(value));
          if (!date) throw new Error(`${field.label}格式無效，請輸入臺灣時間。`);
          data[field.name] = date.toISOString();
        } else data[field.name] = field.type === "number" ? (value === "" ? null : Number(value)) : field.type === "checkbox" ? value === "on" : value;
      }
      if (["receipt", "finalize", "exception"].includes(operation)) data.confirmed = true;
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, checkoutId, data }) });
      await readJsonResponse(response);
      setMessage("已儲存。"); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "失敗，請確認目前狀態後再重試。"); }
    finally { submitting.current = false; setBusy(false); }
  }}>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{fields.map(field => field.type === "hidden" ? <input key={field.name} type="hidden" name={field.name} value={field.value}/> : <label key={field.name} className={field.type === "checkbox" ? "flex items-start gap-2 text-sm" : "text-sm font-medium"}>{field.type === "checkbox" ? <><input name={field.name} type="checkbox" defaultChecked={String(field.value) === "true"} className="mt-1 h-4 w-4 shrink-0"/>{field.label}</> : <>{field.label}{field.type === "datetime-local" && <span className="ml-1 text-xs text-stone-600">（臺灣時間 UTC+8）</span>}{field.options ? <select name={field.name} defaultValue={field.value} className={fieldStyles}>{field.options.map(value => <option key={value} value={value}>{labels[value] ?? value}</option>)}</select> : <input aria-label={field.label} name={field.name} type={field.type ?? "text"} defaultValue={field.value} required={field.required ?? true} min={field.type === "number" ? 0 : undefined} className={fieldStyles}/>}</>}</label>)}
      <button className={buttonStyles.primary}>{busy ? "處理中…" : label}</button>
    </fieldset>{message && <p role={failed ? "alert" : "status"} className={failed ? "text-red-800" : "text-emerald-800"}>{message}</p>}
  </form>;
}

