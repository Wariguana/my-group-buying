"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { loadCart, saveCart, CART_KEY } from "@/lib/commerce/cart-storage";
import { cartSchema, type CartLine } from "@/lib/commerce/validation";
import { revalidateCartAction } from "./actions";
import { titleStyles, linkStyles, fieldStyles, buttonStyles, ErrorNotice } from "@/components/ui/primitives";

type Validated = Extract<Awaited<ReturnType<typeof revalidateCartAction>>, { ok: true }>["value"];
export function CartClient() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [result, setResult] = useState<Validated | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(false);
  const revision = useRef(0);
  function verify(next: CartLine[]) {
    const requestRevision = ++revision.current;
    setResult(null);
    start(async () => {
      try {
        const response = await revalidateCartAction(next);
        if (requestRevision !== revision.current) return;
        if (response.ok) { setResult(response.value); setError(""); } else setError(response.error);
      } catch { if (requestRevision === revision.current) setError("無法驗證購物車，請稍後重試。"); }
    });
  }
  useEffect(() => {
    const read = () => {
      try { const next = loadCart(localStorage); setLines(next); setError(""); setReady(true); verify(next); }
      catch (e) { revision.current++; setResult(null); setError(e instanceof Error ? e.message : "無法讀取購物車。"); setReady(true); }
    };
    read();
    const sync = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) read(); };
    const focus = () => read();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", focus);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", focus); };
  }, []);
  function update(next: CartLine[]) {
    try { const parsed = cartSchema.parse(next); saveCart(localStorage, parsed); setLines(parsed); setError(""); verify(parsed); }
    catch { setError("無法儲存；數量須為 1–9999，且瀏覽器必須允許儲存資料。"); }
  }
  return <div className="space-y-6"><h1 className={titleStyles.page}>跨團購物車</h1><p>加入購物車不預留庫存。價格與可售資格以伺服器重新驗證為準。</p>
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {!ready || pending ? <p role="status">正在重新驗價與查詢庫存…</p> : null}
    {ready && !error && lines.length === 0 && <p>購物車目前沒有商品。<Link href="/" className={linkStyles.inline}>前往選購</Link></p>}
    <fieldset disabled={pending} className="space-y-4">{lines.map((line) => {
      const item = result?.items.find((i) => i.offerId === line.offerId);
      return <article key={line.offerId} className="rounded-xl border border-stone-200 bg-white p-5"><h2 className={titleStyles.card}>{item?.label ?? "待驗證商品"}</h2><p>{item?.groupTitle}</p>
        <p>單價 NT${item?.currentPrice ?? "—"}／共用可售庫存 {item?.available ?? "—"}</p>
        {item?.status && <p role="status" className="text-red-800">{item.status}</p>}
        <label>數量 <input aria-label={`${item?.groupTitle ?? line.offerId}數量`} className={`m-2 w-24 ${fieldStyles}`} type="number" min={1} max={9999} value={line.quantity} onChange={(e) => update(lines.map((l) => l.offerId === line.offerId ? { ...l, quantity: Number(e.target.value) } : l))} /></label>
        <button className={`m-2 ${buttonStyles.danger}`} onClick={() => { if (window.confirm("確定移除此商品？")) update(lines.filter((l) => l.offerId !== line.offerId)); }}>移除</button>
        {item?.status === "價格已變動" && item.currentPrice !== null && <button className={`m-2 ${buttonStyles.secondary}`} onClick={() => update(lines.map((l) => l.offerId === line.offerId ? { ...l, expectedPrice: item.currentPrice! } : l))}>接受最新價格</button>}
        <p>可計入小計 NT${item?.subtotal ?? 0}</p>
      </article>;
    })}</fieldset>
    <button disabled={pending || !ready} className={buttonStyles.secondary} onClick={() => verify(lines)}>重新驗價與庫存</button>
    {result && !pending && <p role="status" className="text-xl font-bold">有效商品小計 NT${result.total}</p>}
    {result && !pending && !error && result.items.length > 0 && result.items.every(item => !item.status) ? <Link href="/checkout" className={buttonStyles.primary}>前往跨團結帳</Link> : <p className="text-sm text-stone-600">請先確認購物車內所有商品的價格、數量與販售狀態，再前往結帳。</p>}
    <a href="/api/auth/line/start" className={buttonStyles.line}>LINE 登入，保留購物車</a>
    <p className="text-sm">購物車保存在本瀏覽器，登入或登出後保留。共用裝置請移除不需保留的商品。購物車不儲存顧客私人資料。</p>
    {error && <button className={buttonStyles.danger} onClick={() => { if (window.confirm("清除本機購物車？")) update([]); }}>清除無效購物車</button>}
  </div>;
}
