"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export type Field = {
    name: string;
    label: string;
    type?: string;
    value?: string | number;
    options?: readonly string[];
    required?: boolean;
};
export function OperationForm({ operation, checkoutId, fields, label, confirmMessage }: {
    operation: string;
    checkoutId?: string;
    fields: Field[];
    label: string;
    confirmMessage?: string;
}) {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const router = useRouter();
    return <form className="space-y-3 rounded border p-4" onSubmit={async (e) => {
            e.preventDefault();
            if (confirmMessage && !window.confirm(confirmMessage))
                return;
            const f = new FormData(e.currentTarget);
            const data: Record<string, unknown> = {};
            for (const field of fields) {
                const value = f.get(field.name);
                data[field.name] = field.type === "number" ? (value === "" ? null : Number(value)) : field.type === "checkbox" ? value === "on" : field.type === "datetime-local" ? new Date(String(value)).toISOString() : value;
            }
            if (operation === "receipt") {
                data.requestId = String(f.get("requestId"));
                data.confirmed = true;
            }
            if (operation === "finalize" || operation === "exception")
                data.confirmed = true;
            setBusy(true);
            setMessage("");
            try {
                const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, checkoutId, data }) });
                const result = await response.json();
                if (!response.ok)
                    throw new Error(result.error);
                setMessage("已儲存。");
                router.refresh();
            }
            catch (error) {
                setMessage(error instanceof Error ? error.message : "失敗，請重試。");
            }
            finally {
                setBusy(false);
            }
        }}>
 <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{fields.map(field => field.type === "hidden" ? <input key={field.name} type="hidden" name={field.name} value={field.value}/> : <label key={field.name}>{field.label}{field.options ? <select name={field.name} defaultValue={field.value} className="block w-full rounded border p-2">{field.options.map(value => <option key={value}>{value}</option>)}</select> : <input name={field.name} type={field.type ?? "text"} defaultValue={field.type === "checkbox" ? undefined : field.value} defaultChecked={field.type === "checkbox" && field.value === "true"} required={field.required ?? field.type !== "checkbox"} className="block w-full rounded border p-2"/>}</label>)}<button className="rounded bg-stone-900 p-3 text-white disabled:opacity-50">{busy ? "處理中…" : label}</button></fieldset>{message && <p role="status">{message}</p>}</form>;
}
