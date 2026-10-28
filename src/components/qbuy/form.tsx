"use client";
import { labels } from "@/lib/qbuy/domain";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse } from "@/lib/http/client-json";
import { buttonStyles, fieldStyles } from "@/components/ui/primitives";
export type Field = { name: string; label: string; type?: string; options?: readonly string[]; required?: boolean; value?: string | number };
export function QbuyForm({ operation, base, fields, label, confirm = false }: { operation: string; base: Record<string, unknown>; fields: Field[]; label: string; confirm?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const submitting = useRef(false);
  const router = useRouter();
  return <form aria-label={label} aria-busy={busy} className="my-3 space-y-3 rounded-xl border border-stone-200 bg-white p-4" onSubmit={async e => {
    e.preventDefault();
    if (submitting.current) return;
    if (confirm && !window.confirm("已核對操作對象、金額及證據，確認執行？")) return;
    submitting.current = true;
    const form = new FormData(e.currentTarget), data: Record<string, unknown> = { ...base };
    if (["cancel", "refund", "shipment", "event", "receive", "inspect"].includes(operation)) data.requestId = requestId;
    if (confirm) data.confirmed = true;
    for (const f of fields) {
      const v = form.get(f.name);
      if (!f.required && v === "" && f.type !== "checkbox") continue;
      data[f.name] = f.type === "number" ? Number(v) : f.type === "checkbox" ? v === "on" : v;
    }
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/qbuy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, data }) });
      await readJsonResponse(response);
      // Acknowledged commands get a fresh key. Failed/ambiguous responses keep the key for safe retry.
      setRequestId(crypto.randomUUID());
      setMessage("操作已完成。"); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "操作失敗，請確認目前狀態後再重試。"); }
    finally { submitting.current = false; setBusy(false); }
  }}>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{fields.map(f => <label className={f.type === "checkbox" ? "flex items-start gap-2 text-sm" : "text-sm font-medium"} key={f.name}>{f.type === "checkbox" ? <><input name={f.name} type="checkbox" className="mt-1 h-4 w-4 shrink-0"/>{f.label}</> : <>{f.label}{f.options ? <select name={f.name} required={f.required ?? true} defaultValue={f.value} className={fieldStyles}>{f.options.map(v => <option key={v} value={v}>{labels[v] ?? v}</option>)}</select> : <input name={f.name} type={f.type ?? "text"} required={f.required ?? true} defaultValue={f.value} min={f.type === "number" ? 0 : undefined} className={fieldStyles}/>}</>}</label>)}
      <button className={buttonStyles.primary}>{busy ? "處理中…" : label}</button>
    </fieldset>
    {message && <p role={failed ? "alert" : "status"} className={failed ? "text-red-800" : "text-emerald-800"}>{message}</p>}
  </form>;
}
