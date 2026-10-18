"use client";
import { useEffect, useState } from "react";
export function TransferForm({ checkoutId, expiresAt }: {
    checkoutId: string;
    expiresAt: string;
}) {
    const [now, setNow] = useState(() => Date.now());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
    return <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
                const file = form.get("screenshot");
                if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
                    throw new Error("請選擇一張不超過 5 MB 的 JPG／PNG。");
                const response = await fetch(`/api/checkout/${checkoutId}/screenshot`, { method: "POST", headers: { "x-last-five": String(form.get("lastFive")) }, body: file });
                const result = await response.json();
                if (!response.ok)
                    throw new Error(result.error);
                location.reload();
            }
            catch (error) {
                setError(error instanceof Error ? error.message : "送出失敗。");
            }
            finally {
                setBusy(false);
            }
        }}>
 <p role="status">剩餘 {Math.floor(remaining / 3600)} 小時 {Math.floor(remaining % 3600 / 60)} 分 {remaining % 60} 秒</p>
 <fieldset disabled={busy || remaining === 0} className="space-y-4"><label className="block">轉出帳號末五碼<input name="lastFive" required pattern="[0-9]{5}" maxLength={5} className="ml-3 rounded border p-2"/></label>
 <label className="block">轉帳截圖（必填，JPG／PNG，5 MB）<input name="screenshot" type="file" required accept="image/png,image/jpeg" className="block p-2"/></label>
 <button className="rounded bg-stone-900 p-3 text-white disabled:opacity-50">{busy ? "送出中…" : "提交付款回報"}</button></fieldset>
 <p>成功提交後不可自行修改；更正請聯絡 LINE 官方客服。回報時間為伺服器收件時間，並非銀行入帳時間。</p>
 {remaining === 0 && <p>付款回報已關閉；若已轉帳，請聯絡客服處理，勿再次付款。</p>}{error && <p role="alert">{error}</p>}</form>;
}
