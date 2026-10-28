"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CART_KEY, loadCart, removeAcknowledgedCartLines } from "@/lib/commerce/cart-storage";
import { revalidateCartAction } from "@/app/cart/actions";
import type { CartLine } from "@/lib/commerce/validation";
import type { CheckoutQuote } from "@/lib/checkout/presentation";
import { labels } from "@/lib/qbuy/domain";
import { requestJson } from "@/lib/http/client-json";
import { buttonStyles, fieldStyles, ErrorNotice } from "@/components/ui/primitives";

export function CheckoutForm({ methods, stores, customerAccountId }: { methods: string[]; stores: { id: string; name: string; address: string }[]; customerAccountId: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [token, setToken] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [requestId, setRequestId] = useState("");
  const [method, setMethod] = useState(methods[0] ?? "");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [draft, setDraft] = useState({ customerName: "", customerPhone: "", address: "" });
  const draftKey = `qbuy-checkout-store-draft:${customerAccountId}`;
  const requestKey = `qbuy-checkout-request:${customerAccountId}`;
  const submitting = useRef(false);
  const revision = useRef(0);
  const cartRevision = useRef(0);
  useEffect(() => {
    let active = true;
    let restoreDraft = true;
    function read() {
      const current = ++cartRevision.current;
      revision.current++;
      setQuote(null);
      setSlug("");
      try {
        const cart = loadCart(localStorage);
        setLines(cart);
        const query = new URLSearchParams(window.location.search);
        const selectionToken = query.get("selectionToken") ?? "";
        setToken(selectionToken);
        if (restoreDraft) {
          restoreDraft = false;
          setDraft({ customerName: "", customerPhone: "", address: "" });
          if (selectionToken || query.has("storeSelectionError")) {
            try {
              const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
              if (saved && ["customerName", "customerPhone", "address"].every(name => typeof saved[name] === "string" && saved[name].length <= 300)) setDraft(saved);
            } catch { sessionStorage.removeItem(draftKey); setError("選店前的資料無法還原，請重新填寫收件資料。"); }
            setMethod("SEVEN_ELEVEN");
            if (query.has("storeSelectionError")) setError("目前無法選擇 7-ELEVEN 門市，請重試或改用其他配送方式。");
          }
        }
        const key = sessionStorage.getItem(requestKey) ?? crypto.randomUUID();
        sessionStorage.setItem(requestKey, key);
        setRequestId(key);
        setReady(true);
        void revalidateCartAction(cart).then(r => {
          if (!active || current !== cartRevision.current) return;
          if (r.ok) setSlug(r.value.items[0]?.slug ?? "");
          else setError(r.error);
        }).catch(() => { if (active && current === cartRevision.current) setError("無法驗證購物車，請稍後重新整理。"); });
      } catch { setError("無法讀取購物車，請確認瀏覽器允許儲存資料。"); setReady(true); }
    }
    read();
    const sync = (e: StorageEvent) => { if (e.key === CART_KEY || e.key === null) read(); };
    window.addEventListener("storage", sync);
    return () => { active = false; window.removeEventListener("storage", sync); };
  }, [draftKey, requestKey]);

  async function submit(form: HTMLFormElement) {
    if (submitting.current) return;
    submitting.current = true;
    const current = revision.current;
    setBusy(true); setError("");
    try {
      const f = new FormData(form);
      const data = {
        requestId, lines, customerName: String(f.get("customerName")), customerPhone: String(f.get("customerPhone")), method,
        address: method === "HOME_DELIVERY" ? String(f.get("address") ?? "") : "",
        ...(method === "FAMILY_MART" ? { familyStoreId: String(f.get("familyStoreId")) } : {}),
        ...(method === "SEVEN_ELEVEN" ? { selectionToken: token } : {}),
        ...(quote ? { quoteFingerprint: quote.quoteFingerprint } : {}),
      };
      const result = await requestJson<CheckoutQuote & { id: string | null }>("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: quote ? "create" : "quote", data }) });
      if (result.id) {
        // Storage cleanup must never turn an acknowledged purchase into an apparent failure.
        try { sessionStorage.removeItem(requestKey); sessionStorage.removeItem(draftKey); removeAcknowledgedCartLines(localStorage, lines); } catch { /* The confirmed purchase remains accessible in My Orders. */ }
        router.push(`/checkout/${result.id}`);
      } else if (current === revision.current) setQuote(result);
    } catch (e) { setError(e instanceof Error ? e.message : "結帳失敗，請先查看我的訂單，再確認是否需要重試。"); setQuote(null); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className="space-y-5">
    <ol aria-label="結帳步驟" className="flex flex-wrap gap-3 text-sm text-stone-600"><li>1. 填寫配送</li><li>2. 核對各組運費</li><li>3. 轉帳及回報</li></ol>
    {!ready && <p role="status">正在讀取購物車…</p>}
    {ready && !lines.length && <p>購物車目前沒有商品。<Link href="/cart" className="underline">返回購物車</Link></p>}
    {method === "SEVEN_ELEVEN" && <div className="rounded-xl border bg-white p-4"><p>7-ELEVEN 請先完成門市選擇，再返回結帳。</p>{slug && <form method="post" action="/api/logistics/ecpay/store-map/start?flow=checkout" onSubmit={e => { try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { e.preventDefault(); setError("無法保留配送資料，請允許本分頁儲存資料後再選店。"); } }}><input type="hidden" name="groupBuySlug" value={slug}/><button disabled={busy} className={buttonStyles.secondary}>選擇 7-ELEVEN 門市</button></form>}{token && <p role="status">已帶回門市選擇，建立結帳時將再次驗證。</p>}</div>}
    <form className="space-y-4" aria-busy={busy} onChange={() => { revision.current++; setQuote(null); }} onSubmit={e => { e.preventDefault(); void submit(e.currentTarget); }}>
      <p>共 {lines.length} 項商品；一次購買選擇一種配送方式。</p>
      <fieldset disabled={busy} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <label>收件人姓名<input name="customerName" value={draft.customerName} onChange={e => setDraft({ ...draft, customerName: e.target.value })} autoComplete="shipping name" required maxLength={80} className={fieldStyles}/></label>
        <label>手機<input name="customerPhone" value={draft.customerPhone} onChange={e => setDraft({ ...draft, customerPhone: e.target.value })} type="tel" inputMode="tel" autoComplete="shipping tel" required pattern="09[0-9]{8}" maxLength={10} placeholder="09 開頭，共 10 碼" className={fieldStyles}/></label>
        <label className="sm:col-span-2">配送方式<select aria-label="配送方式" name="method" value={method} onChange={e => setMethod(e.target.value)} required className={fieldStyles}>{methods.map(m => <option key={m} value={m}>{labels[m] ?? m}</option>)}</select></label>
        {method === "FAMILY_MART" && <label className="sm:col-span-2">全家門市<select aria-label="全家門市" name="familyStoreId" required className={fieldStyles}><option value="">選擇門市</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name} · {s.address}</option>)}</select></label>}
        {method === "HOME_DELIVERY" && <label className="sm:col-span-2">宅配地址<input name="address" value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} autoComplete="shipping street-address" required minLength={8} maxLength={300} className={fieldStyles}/></label>}
        {quote && <section aria-label="配送報價明細" className="space-y-3 sm:col-span-2"><h2 className="text-lg font-bold">確認商品與各組運費</h2>{quote.groups.map((g, index) => <div key={index} className="rounded-lg bg-stone-50 p-4">
          <h3 className="font-bold">出貨群組 {index + 1} · {labels[method]}／{labels[g.temperature]}</h3>
          <ul>{g.items.map((item, i) => <li key={i}>{item.groupTitle} · {item.productName} × {item.quantity}</li>)}</ul>
          <p>本組商品 NT${g.subtotal} · 本組運費 NT${g.shippingAmount}</p>
          <p className="text-sm text-stone-600">{g.freeThreshold === null ? "本組未設定免運門檻" : `本組滿 NT$${g.freeThreshold} 免運，獨立群組分開計算`}；等待全部開團截止：{new Date(g.waitUntil).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
        </div>)}<p role="status" className="text-lg font-bold">商品 NT${quote.subtotal}＋運費 NT${quote.shippingAmount}＝應付 NT${quote.totalAmount}</p></section>}
        <button disabled={!ready || !requestId || !lines.length || !methods.length || (method === "SEVEN_ELEVEN" && !token)} className={`${buttonStyles.primary} sm:col-span-2`}>{busy ? "處理中…" : quote ? "確認金額並前往付款" : "計算配送與總額"}</button>
      </fieldset>
      <p className="text-sm text-stone-600">建立成功才預留庫存，付款與回報期限為完整六小時。超商配送須選擇已核實的門市。</p>
      {!methods.length && <p>尚未設定可用配送能力，請聯絡客服。</p>}{error && <ErrorNotice>{error}</ErrorNotice>}
    </form>
    <Link href="/cart" className={buttonStyles.secondary}>返回購物車調整商品</Link>
  </div>;
}
