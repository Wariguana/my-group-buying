"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadCart } from "@/lib/commerce/cart-storage";
import { revalidateCartAction } from "@/app/cart/actions";
import type { CartLine } from "@/lib/commerce/validation";
export function CheckoutForm({ methods, stores }: {
    methods: string[];
    stores: {
        id: string;
        name: string;
        address: string;
    }[];
}) {
    const router = useRouter();
    const [slug, setSlug] = useState("");
    const [token, setToken] = useState("");
    const [lines, setLines] = useState<CartLine[]>([]);
    const [requestId, setRequestId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [quote, setQuote] = useState<{
        subtotal: number;
        shippingAmount: number;
        totalAmount: number;
        quoteFingerprint: string;
    } | null>(null);
    useEffect(() => {
        function read() {
            try {
                const cart = loadCart(localStorage);
                setLines(cart);
                void revalidateCartAction(cart).then(r => {
                    if (r.ok)
                        setSlug(r.value.items[0]?.slug ?? "");
                });
                setToken(new URLSearchParams(window.location.search).get("selectionToken") ?? "");
                const key = sessionStorage.getItem("qbuy-checkout-request") ?? crypto.randomUUID();
                sessionStorage.setItem("qbuy-checkout-request", key);
                setRequestId(key);
            }
            catch {
                setError("無法讀取購物車。");
            }
        }
        read();
    }, []);
    async function submit(form: HTMLFormElement, operation: string) {
        setBusy(true);
        setError("");
        try {
            const f = new FormData(form);
            const data = { ...(f.get("familyStoreId") ? { familyStoreId: String(f.get("familyStoreId")) } : {}), requestId, lines, ...(operation === "create" ? { quoteFingerprint: quote?.quoteFingerprint } : {}), customerName: String(f.get("customerName")), customerPhone: String(f.get("customerPhone")), method: String(f.get("method")), address: String(f.get("address")), ...(f.get("selectionToken") ? { selectionToken: String(f.get("selectionToken")) } : {}) };
            const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, data }) });
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.error);
            if (result.id) {
                sessionStorage.removeItem("qbuy-checkout-request");
                router.push(`/checkout/${result.id}`);
            }
            else
                setQuote(result);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "結帳失敗。");
            setQuote(null);
        }
        finally {
            setBusy(false);
        }
    }
    return <><p>7-ELEVEN 請先完成門市選擇，再返回結帳。</p>{slug && methods.includes("SEVEN_ELEVEN") && <form method="post" action="/api/logistics/ecpay/store-map/start"><input type="hidden" name="groupBuySlug" value={slug}/><button className="my-3 underline">選擇 7-ELEVEN 門市</button></form>}<form className="space-y-4" onChange={() => setQuote(null)} onSubmit={e => { e.preventDefault(); void submit(e.currentTarget, quote ? "create" : "quote"); }}>
    <p>共 {lines.length} 項商品；一次購買選擇一種配送方式。所有價格、分組與庫存均由伺服器驗證。</p>
    <fieldset disabled={busy} className="grid gap-4">
      <label>收件人姓名<input name="customerName" required maxLength={80} className="block rounded border p-2"/></label>
      <label>手機<input name="customerPhone" required pattern="09[0-9]{8}" className="block rounded border p-2"/></label>
      <label>配送方式<select name="method" required className="block rounded border p-2">{methods.map(m => <option key={m} value={m}>{m === "HOME_DELIVERY" ? "宅配" : m === "FAMILY_MART" ? "全家" : "7-ELEVEN"}</option>)}</select></label>
      {methods.includes("FAMILY_MART") && <label>全家門市<select name="familyStoreId" className="block w-full rounded border p-2"><option value="">選擇門市</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name} · {s.address}</option>)}</select></label>}
      <label>宅配地址<input name="address" maxLength={300} className="block w-full rounded border p-2"/></label>
      <input type="hidden" name="selectionToken" value={token}/>{token && <p>已帶回門市選擇，建立結帳時將再次驗證。</p>}
      {quote && <p role="status">商品 NT${quote.subtotal}＋運費 NT${quote.shippingAmount}＝應付 NT${quote.totalAmount}</p>}
      <button disabled={!requestId || !lines.length || !methods.length} className="rounded bg-stone-900 p-3 text-white disabled:opacity-50">{busy ? "處理中…" : quote ? "確認金額並建立 Checkout" : "計算配送與總額"}</button>
    </fieldset>
    <p>建立成功才預留庫存，付款期限為完整六小時。超商配送須選擇已核實的門市。</p>
    {!methods.length && <p>尚未設定可用配送能力，請聯絡客服。</p>}{error && <p role="alert" className="text-red-800">{error}</p>}
  </form></>;
}
