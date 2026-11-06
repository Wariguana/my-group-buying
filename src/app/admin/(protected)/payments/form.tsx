"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { bankInput } from "@/lib/checkout/validation";
import { parseTaipeiDateTimeLocal } from "@/lib/group-buys/time";
import { labels } from "@/lib/qbuy/domain";
import { JsonRequestError, requestJson } from "@/lib/http/client-json";
import { useUnsavedBankSettings } from "@/components/admin/use-unsaved-bank-settings";
import { checkStyles, buttonStyles, fieldStyles, messageStyles, labelStyles } from "@/components/ui/primitives";

export type Field = { name: string; label: string; type?: string; value?: string | number; options?: readonly string[]; required?: boolean };
const signature = (form: HTMLFormElement) => JSON.stringify([...new FormData(form).entries()]);

export function OperationForm({ operation, checkoutId, fields, label, confirmMessage }: { operation: string; checkoutId?: string; fields: Field[]; label: string; confirmMessage?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const saved = useRef("");
  const focusRequested = useRef(false);
  const id = useId();
  const router = useRouter();
  const bank = operation === "bank";
  useUnsavedBankSettings(bank && dirty);
  useEffect(() => { if (formRef.current) saved.current = signature(formRef.current); }, []);
  useEffect(() => {
    if (focusRequested.current && failed && !busy) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      focusRequested.current = false;
    }
  }, [fieldErrors, failed, busy]);

  function readBank(form: HTMLFormElement) {
    const data = Object.fromEntries(new FormData(form));
    return bankInput.safeParse({ ...data, enabled: data.enabled === "on" });
  }

  return <form ref={formRef} aria-label={label} aria-busy={busy} noValidate={bank} className="min-w-0 space-y-3 rounded-xl border bg-white p-4"
    onChange={event => { if (bank) setDirty(signature(event.currentTarget) !== saved.current); }}
    onBlur={event => {
      if (!bank || busy || !(event.target instanceof HTMLInputElement)) return;
      // Submit validates every field. Avoid moving the button between pointer
      // down/up when a blur error adds height immediately before that click.
      if (event.relatedTarget instanceof HTMLButtonElement && event.relatedTarget.type === "submit" && event.currentTarget.contains(event.relatedTarget)) return;
      const name = event.target.name;
      const parsed = readBank(event.currentTarget);
      const errors: Record<string, string[] | undefined> = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
      setFieldErrors(previous => ({ ...previous, [name]: errors[name] ?? [] }));
    }}
    onSubmit={async event => {
      event.preventDefault();
      if (submitting.current) return;
      const form = event.currentTarget;
      if (bank) {
        const parsed = readBank(form);
        if (!parsed.success) {
          focusRequested.current = true;
          setFieldErrors(z.flattenError(parsed.error).fieldErrors); setFailed(true); setMessage("請修正標示的欄位。");
          return;
        }
      }
      if (confirmMessage && !window.confirm(confirmMessage)) return;
      const values = new FormData(form);
      submitting.current = true; setBusy(true); setMessage(""); setFailed(false); setFieldErrors({});
      try {
        const data: Record<string, unknown> = {};
        for (const field of fields) {
          const value = values.get(field.name);
          if (field.type === "datetime-local") {
            const date = parseTaipeiDateTimeLocal(String(value));
            if (!date) throw new JsonRequestError("請修正標示的欄位。", { [field.name]: [`${field.label}格式無效，請輸入臺灣時間。`] });
            data[field.name] = date.toISOString();
          } else data[field.name] = field.type === "number" ? (value === "" ? null : Number(value)) : field.type === "checkbox" ? value === "on" : value;
        }
        if (["receipt", "finalize", "exception"].includes(operation)) data.confirmed = true;
        await requestJson("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, checkoutId, data }) });
        // Disabled fieldsets are omitted from FormData; preserve the submitted values.
        saved.current = JSON.stringify([...values.entries()]); setDirty(false);
        setMessage("已儲存。"); router.refresh();
      } catch (error) {
        focusRequested.current = true;
        setFailed(true); setMessage(error instanceof Error ? error.message : "失敗，請確認目前狀態後再重試。");
        if (error instanceof JsonRequestError) setFieldErrors(error.fieldErrors);
      } finally { submitting.current = false; setBusy(false); }
    }}>
    {message && <p role={failed ? "alert" : "status"} className={failed ? messageStyles.error : messageStyles.success}>{message}</p>}
    {bank && dirty && <p role="status" className="text-sm text-amber-900">有尚未儲存的銀行設定。</p>}
    <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">{fields.map(field => {
      const error = fieldErrors[field.name]?.join(" ");
      const fieldId = `${id}-${field.name}`;
      const help = bank && field.name === "bankCode" ? "3 位銀行代碼，例如 004。" : bank && field.name === "bankAccount" ? "6～20 位數字，保留開頭的 0。" : undefined;
      const describedBy = [help ? `${fieldId}-help` : "", error ? `${fieldId}-error` : ""].filter(Boolean).join(" ") || undefined;
      const numeric = bank && ["bankCode", "bankAccount"].includes(field.name);
      if (field.type === "hidden") return <input key={field.name} type="hidden" name={field.name} value={field.value}/>;
      return <div key={field.name} className="min-w-0 space-y-1">
        <label htmlFor={fieldId} className={field.type === "checkbox" ? "flex items-start gap-2 text-sm" : labelStyles}>
          {field.type === "checkbox" ? <><input id={fieldId} name={field.name} type="checkbox" defaultChecked={String(field.value) === "true"} className={checkStyles}/>{field.label}</> : <>{field.label}{field.type === "datetime-local" && <span className="ml-1 text-xs text-stone-600">（臺灣時間 UTC+8）</span>}</>}
        </label>
        {field.type !== "checkbox" && (field.options ? <select id={fieldId} aria-label={field.label} name={field.name} defaultValue={field.value} className={fieldStyles} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy}>{field.options.map(value => <option key={value} value={value}>{({ REBOOK: "重新檢查並補建訂單", REFUND: "建立待處理退款" } as Record<string,string>)[value] ?? labels[value] ?? value}</option>)}</select> : <input id={fieldId} aria-label={field.label} name={field.name} type={field.type ?? "text"} defaultValue={field.value} required={field.required ?? true} min={field.type === "number" ? 0 : undefined} inputMode={numeric ? "numeric" : undefined} autoComplete={bank ? "off" : undefined} spellCheck={numeric ? false : undefined} className={fieldStyles} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy}/>)}
        {help && <p id={`${fieldId}-help`} className="text-sm text-stone-600">{help}</p>}
        {error && <p id={`${fieldId}-error`} className="text-sm font-medium text-red-800">{error}</p>}
      </div>;
    })}<button className={buttonStyles.primary}>{busy ? "處理中…" : label}</button></fieldset>
  </form>;
}
