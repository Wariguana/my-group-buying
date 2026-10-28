"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { loadCart, saveCart } from "@/lib/commerce/cart-storage";
import { revalidateCartAction } from "@/app/cart/actions";
import { buttonStyles, fieldStyles } from "@/components/ui/primitives";
type Offer = { id: string; label: string; salePrice: number; purchaseLimit: number | null; available: number; status: string | null; temperature: string; shippingMethods: string[]; shippingNote: string | null };
export function SkuPicker({ offers }: { offers: Offer[] }) {
  const [selected, setSelected] = useState(offers.find(o => !o.status)?.id ?? offers[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const offer = offers.find((o) => o.id === selected);
  return <section className="my-6 space-y-4 rounded-xl border border-stone-200 bg-white p-6"><h2 className="text-2xl font-bold">選擇 SKU 規格</h2>
    <label>商品規格<select className={fieldStyles} value={selected} onChange={(e) => { setSelected(e.target.value); setMessage(""); }}>{offers.map((o) => <option key={o.id} value={o.id}>{o.label}／NT${o.salePrice}{o.status ? `／${o.status}` : ""}</option>)}</select></label>
    {offer && <><p>開團價格 NT${offer.salePrice}／全站共用可售庫存 {offer.available}／{offer.status ?? "可加入購物車"}</p><p>每次購物數量上限：{offer.purchaseLimit ?? "不限"}</p><p>溫層：{offer.temperature === "FROZEN" ? "冷凍" : offer.temperature === "CHILLED" ? "冷藏" : "常溫"}；配送方式待結帳時再確認。{offer.shippingNote}</p></>}
    <label>數量<input className="m-2 w-24 rounded border p-2" type="number" min={1} max={offer?.purchaseLimit ?? 9999} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
    <button className={buttonStyles.primary} disabled={pending || !offer || !!offer.status || !Number.isInteger(quantity) || quantity < 1} onClick={() => start(async () => {
      try {
        if (!offer) return;
        const old = loadCart(localStorage);
        const existing = old.find((l) => l.offerId === offer.id);
        const next = [...old.filter((l) => l.offerId !== offer.id), { offerId: offer.id, quantity: quantity + (existing?.quantity ?? 0), expectedPrice: offer.salePrice }];
        const validation = await revalidateCartAction(next);
        if (!validation.ok) { setMessage(validation.error); return; }
        const item = validation.value.items.find((l) => l.offerId === offer.id);
        if (!item || item.status) { setMessage(item?.status ?? "商品無法購買。"); return; }
        saveCart(localStorage, next); setMessage("已加入購物車；尚未預留庫存。");
      } catch { setMessage("無法加入，請檢查數量及瀏覽器儲存權限，或前往購物車修正資料。"); }
    })}>{pending ? "驗證中…" : "加入購物車"}</button>
    {message && <p role="status">{message}</p>}<Link className="ml-4 underline" href="/cart">查看購物車</Link>
  </section>;
}
