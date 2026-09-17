"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { startSevenElevenStoreSelectionAction, submitPublicOrderAction } from "./actions";
import { initialPublicOrderActionState, type PublicOrderActionState } from "./order-action-state";

type FulfillmentMethod = "SELF_PICKUP" | "SEVEN_ELEVEN";
type PublicOrderItem = Readonly<{ id: string; salePrice: number; stock: number | null; purchaseLimit: number | null; product: Readonly<{ name: string; unit: string }> }>;
type PublicOrderPickup = Readonly<{ id: string; pickupStartAt: Date | null; pickupEndAt: Date | null; pickupLocation: Readonly<{ name: string; address: string }> }>;

export type PublicOrderFormProps = Readonly<{
  slug: string;
  items: readonly PublicOrderItem[];
  pickups: readonly PublicOrderPickup[];
  allowsSelfPickup: boolean;
  allowsSevenEleven: boolean;
  storeSelectionReturn: boolean;
  storeSelectionError: boolean;
  selectedSevenElevenStore: Readonly<{ id: string; name: string; address: string; selectionToken: string }> | null;
}>;

type PublicOrderFormViewProps = PublicOrderFormProps & Readonly<{
  state: PublicOrderActionState;
  pending: boolean;
  formAction: (formData: FormData) => void;
}>;

const inputClassName = "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base shadow-sm outline-none transition placeholder:text-stone-400 focus:border-amber-700 focus:ring-3 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500 sm:py-3";
const optionClassName = "flex cursor-pointer gap-3 rounded-xl border bg-white p-4 transition hover:border-amber-500 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-amber-200";
const ORDER_DRAFT_VERSION = 1;
const ORDER_DRAFT_TTL_MS = 30 * 60 * 1000;

type PublicOrderDraft = Readonly<{
  version: typeof ORDER_DRAFT_VERSION;
  savedAt: number;
  values: Readonly<{
    quantities: Readonly<Record<string, string>>;
    fulfillmentMethod: FulfillmentMethod;
    selectedPickupId: string;
    customerName: string;
    customerPhone: string;
  }>;
}>;

function orderDraftKey(slug: string): string {
  return `group-buy-order-draft:${slug}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOrderDraft(value: string, now = Date.now()): PublicOrderDraft | null {
  try {
    const draft: unknown = JSON.parse(value);
    if (!isRecord(draft) || draft.version !== ORDER_DRAFT_VERSION || typeof draft.savedAt !== "number" || !Number.isFinite(draft.savedAt)) return null;
    if (draft.savedAt > now + 60_000 || now - draft.savedAt > ORDER_DRAFT_TTL_MS || !isRecord(draft.values)) return null;
    const values = draft.values;
    if (!isRecord(values.quantities) || Object.keys(values.quantities).length > 100) return null;
    if (!Object.values(values.quantities).every((quantity) => typeof quantity === "string" && quantity.length <= 20)) return null;
    if (values.fulfillmentMethod !== "SELF_PICKUP" && values.fulfillmentMethod !== "SEVEN_ELEVEN") return null;
    if (typeof values.selectedPickupId !== "string" || values.selectedPickupId.length > 100) return null;
    if (typeof values.customerName !== "string" || values.customerName.length > 200) return null;
    if (typeof values.customerPhone !== "string" || values.customerPhone.length > 100) return null;
    return {
      version: ORDER_DRAFT_VERSION,
      savedAt: draft.savedAt,
      values: {
        quantities: values.quantities as Record<string, string>,
        fulfillmentMethod: values.fulfillmentMethod,
        selectedPickupId: values.selectedPickupId,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
      },
    };
  } catch {
    return null;
  }
}

function readOrderDraft(slug: string): PublicOrderDraft | null {
  const key = orderDraftKey(slug);
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored === null) return null;
    const draft = parseOrderDraft(stored);
    if (draft) return draft;
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return null;
}

function writeOrderDraft(slug: string, values: PublicOrderDraft["values"]): void {
  try {
    window.sessionStorage.setItem(orderDraftKey(slug), JSON.stringify({ version: ORDER_DRAFT_VERSION, savedAt: Date.now(), values }));
  } catch {
    // Store selection remains available even when optional draft persistence fails.
  }
}

function clearOrderDraft(slug: string): void {
  try {
    window.sessionStorage.removeItem(orderDraftKey(slug));
  } catch {
    // A successful order must remain successful when browser storage is unavailable.
  }
}

function cleanStoreSelectionQuery(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("storeSelection") && !url.searchParams.has("storeSelectionError")) return;
    url.searchParams.delete("storeSelection");
    url.searchParams.delete("storeSelectionError");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL cleanup is presentation-only and must not affect a successful order.
  }
}

function formatPrice(value: number): string {
  return `$${Math.trunc(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function quantityMaximum(item: PublicOrderItem): number | undefined {
  const limits = [item.stock, item.purchaseLimit].filter((value): value is number => value !== null);
  return limits.length > 0 ? Math.min(...limits) : undefined;
}

function stockText(stock: number | null): string {
  if (stock === null) return "庫存不限量";
  if (stock === 0) return "已無庫存";
  return `剩餘 ${stock}`;
}

function purchaseLimitText(purchaseLimit: number | null): string {
  return purchaseLimit === null ? "不限購" : `每人限購 ${purchaseLimit}`;
}

function pickupTime(pickup: PublicOrderPickup): string {
  return pickup.pickupStartAt && pickup.pickupEndAt
    ? `${formatTaipeiDisplayDateTime(pickup.pickupStartAt)}－${formatTaipeiDisplayDateTime(pickup.pickupEndAt)}`
    : "取貨時間另行通知";
}

function StepTitle({ number, title, description }: Readonly<{ number: string; title: string; description?: string }>) {
  return (
    <span className="flex items-start gap-3">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-900">{number}</span>
      <span>
        <span className="block text-lg font-bold text-stone-950">{title}</span>
        {description && <span className="mt-1 block text-sm font-normal leading-6 text-stone-600">{description}</span>}
      </span>
    </span>
  );
}

export function PublicOrderFormView({ slug, items, pickups, allowsSelfPickup, allowsSevenEleven, storeSelectionReturn, storeSelectionError, selectedSevenElevenStore, state, pending, formAction }: PublicOrderFormViewProps) {
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>(selectedSevenElevenStore || !allowsSelfPickup ? "SEVEN_ELEVEN" : "SELF_PICKUP");
  const [selectedPickupId, setSelectedPickupId] = useState(pickups[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedStoreSummary, setSelectedStoreSummary] = useState<Readonly<{ name: string; address: string }> | null>(
    selectedSevenElevenStore ? { name: selectedSevenElevenStore.name, address: selectedSevenElevenStore.address } : null,
  );
  const fulfillmentDetailsRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (!storeSelectionReturn || state.status === "success") return;
    const draft = readOrderDraft(slug);
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      if (draft) {
        const itemIds = new Set(items.map((item) => item.id));
        setQuantities(Object.fromEntries(Object.entries(draft.values.quantities).filter(([itemId]) => itemIds.has(itemId))));
        setCustomerName(draft.values.customerName);
        setCustomerPhone(draft.values.customerPhone);
        if (pickups.some((pickup) => pickup.id === draft.values.selectedPickupId)) setSelectedPickupId(draft.values.selectedPickupId);
      }
      setFulfillmentMethod("SEVEN_ELEVEN");
      secondFrame = window.requestAnimationFrame(() => {
        fulfillmentDetailsRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [items, pickups, slug, state.status, storeSelectionReturn]);

  useEffect(() => {
    if (state.status === "success") {
      clearOrderDraft(slug);
      cleanStoreSelectionQuery();
    }
  }, [slug, state.status]);

  function saveDraftBeforeStoreSelection(): void {
    writeOrderDraft(slug, { quantities, fulfillmentMethod, selectedPickupId, customerName, customerPhone });
  }

  function preserveSelectedStoreSummary(): void {
    if (selectedSevenElevenStore) {
      setSelectedStoreSummary({ name: selectedSevenElevenStore.name, address: selectedSevenElevenStore.address });
    }
  }

  const selectedPickup = pickups.find((pickup) => pickup.id === selectedPickupId);

  if (state.status === "success") {
    const isSevenEleven = fulfillmentMethod === "SEVEN_ELEVEN";
    return (
      <section aria-live="polite" role="status" className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm sm:p-6">
        <h2 className="text-2xl font-bold">訂購成功</h2>
        <p className="mt-3 text-sm font-medium text-emerald-800">訂單編號</p>
        <p className="font-mono text-xl font-bold tracking-wide">{state.orderNumber}</p>
        <p className="mt-3 text-sm font-medium text-emerald-800">訂單金額</p>
        <p className="text-2xl font-bold tracking-tight">{formatPrice(state.totalAmount)}</p>

        <div className="mt-4 rounded-xl border border-emerald-200 bg-white/75 p-4 text-stone-800">
          <p className="text-sm font-medium text-stone-500">取貨方式</p>
          <p className="mt-1 font-bold text-stone-950">{isSevenEleven ? "7-ELEVEN 門市取貨" : "自取"}</p>
          {!isSevenEleven && selectedPickup && (
            <div className="mt-2 text-sm leading-6">
              <p className="font-medium">{selectedPickup.pickupLocation.name}</p>
              <p className="break-words text-stone-600">{selectedPickup.pickupLocation.address}</p>
            </div>
          )}
          {isSevenEleven && selectedStoreSummary && (
            <div className="mt-2 text-sm leading-6">
              <p className="font-medium">7-ELEVEN {selectedStoreSummary.name}</p>
              <p className="break-words text-stone-600">{selectedStoreSummary.address}</p>
            </div>
          )}
        </div>

        <a href={`/orders/${state.publicCode}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-800 px-5 py-2.5 font-bold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">查看訂單</a>
      </section>
    );
  }

  const hasMultipleMethods = allowsSelfPickup && allowsSevenEleven;
  const selectedItems = items.flatMap((item) => {
    const quantity = Number(quantities[item.id]);
    return Number.isSafeInteger(quantity) && quantity > 0 ? [{ item, quantity, subtotal: item.salePrice * quantity }] : [];
  });
  const totalQuantity = selectedItems.reduce((total, line) => total + line.quantity, 0);
  const estimatedTotal = selectedItems.reduce((total, line) => total + line.subtotal, 0);

  return (
    <section aria-labelledby="order-heading" className="mt-8 border-t border-stone-200 pt-8 sm:pt-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Checkout</p>
      <h2 id="order-heading" className="mt-1 text-2xl font-bold sm:text-3xl">填寫訂購資料</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">依序選擇商品、取貨方式並填寫聯絡資料，送出前可在下方再次確認。</p>
      {storeSelectionError && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">無法使用這次的 7-ELEVEN 門市選擇，請重新選擇。</p>}
      <form action={formAction} onSubmit={preserveSelectedStoreSummary} aria-busy={pending} className="mt-7 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-0">
        <input type="hidden" name="groupBuySlug" value={slug} />
        {!hasMultipleMethods && <input type="hidden" name="fulfillmentMethod" value={allowsSelfPickup ? "SELF_PICKUP" : "SEVEN_ELEVEN"} />}
        <fieldset disabled={pending} className="divide-y divide-stone-200 disabled:opacity-60">
          <legend className="sr-only">訂購表單</legend>
          <fieldset className="pb-6 sm:pb-8">
            <legend className="w-full"><StepTitle number="1" title="商品數量" description="請填寫要購買的數量，未選購的商品可留空。" /></legend>
            <div className="mt-5 space-y-3">
              {items.map((item) => {
                const unavailable = item.stock === 0 || item.purchaseLimit === 0;
                const unavailableText = item.stock === 0 ? "已無庫存" : "目前不可購買";
                return (
                  <div key={item.id} className="grid gap-4 rounded-xl bg-stone-50 p-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:px-5">
                    <input type="hidden" name={`price:${item.id}`} value={item.salePrice} />
                    <div className="min-w-0">
                      <h3 className="font-bold text-stone-950">{item.product.name}</h3>
                      <p className="mt-1 text-sm font-medium text-amber-900"><span>{formatPrice(item.salePrice)}</span><span aria-hidden="true">／</span><span>{item.product.unit}</span></p>
                      <p id={`availability-${item.id}`} className="mt-2 text-sm text-stone-600"><span>{stockText(item.stock)}</span><span aria-hidden="true"> · </span><span>{purchaseLimitText(item.purchaseLimit)}</span></p>
                      {unavailable && <p className="mt-1 text-sm font-medium text-red-700">{unavailableText}</p>}
                    </div>
                    <div className="space-y-2">
                      <label htmlFor={`quantity-${item.id}`} className="block text-sm font-bold text-stone-800">{item.product.name}數量</label>
                      <input id={`quantity-${item.id}`} name={`item:${item.id}`} type="number" inputMode="numeric" min="0" max={quantityMaximum(item)} step="1" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} disabled={unavailable} aria-describedby={`availability-${item.id}`} placeholder="0" className={`${inputClassName} min-h-12 text-lg font-semibold`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="py-6 sm:py-8">
            <legend className="w-full"><StepTitle number="2" title="取貨方式" description={hasMultipleMethods ? "選擇最方便的取貨方式。" : "此團購目前提供以下取貨方式。"} /></legend>
            {hasMultipleMethods ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className={`${optionClassName} ${fulfillmentMethod === "SELF_PICKUP" ? "border-amber-700 bg-amber-50 ring-1 ring-amber-700" : "border-stone-300"}`}>
                  <input aria-label="自取" type="radio" name="fulfillmentMethod" value="SELF_PICKUP" checked={fulfillmentMethod === "SELF_PICKUP"} onChange={() => setFulfillmentMethod("SELF_PICKUP")} required className="mt-0.5 h-5 w-5 shrink-0 accent-amber-800" />
                  <span><span className="block font-bold">自取</span><span className="mt-1 block text-sm leading-6 text-stone-600">到指定取貨地點領取</span>{fulfillmentMethod === "SELF_PICKUP" && <span className="mt-2 block text-xs font-bold text-amber-900">已選擇</span>}</span>
                </label>
                <label className={`${optionClassName} ${fulfillmentMethod === "SEVEN_ELEVEN" ? "border-amber-700 bg-amber-50 ring-1 ring-amber-700" : "border-stone-300"}`}>
                  <input aria-label="7-ELEVEN 門市取貨" type="radio" name="fulfillmentMethod" value="SEVEN_ELEVEN" checked={fulfillmentMethod === "SEVEN_ELEVEN"} onChange={() => setFulfillmentMethod("SEVEN_ELEVEN")} required className="mt-0.5 h-5 w-5 shrink-0 accent-amber-800" />
                  <span><span className="block font-bold">7-ELEVEN 門市取貨</span><span className="mt-1 block text-sm leading-6 text-stone-600">訂購時選擇取件門市</span>{fulfillmentMethod === "SEVEN_ELEVEN" && <span className="mt-2 block text-xs font-bold text-amber-900">已選擇</span>}</span>
                </label>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="font-bold">{allowsSelfPickup ? "自取" : "7-ELEVEN 門市取貨"}</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">{allowsSelfPickup ? "到指定取貨地點領取" : "訂購時選擇取件門市"}</p>
              </div>
            )}
          </fieldset>

          <fieldset ref={fulfillmentDetailsRef} id="fulfillment-details" data-testid="fulfillment-details" className="scroll-mt-6 py-6 sm:scroll-mt-10 sm:py-8">
            <legend className="w-full"><StepTitle number="3" title="取貨資訊" description={fulfillmentMethod === "SELF_PICKUP" ? "請確認並選擇自取地點。" : "選定的門市會用於本次訂單。"} /></legend>
            {fulfillmentMethod === "SELF_PICKUP" && (
              <div className="mt-5 space-y-3">
                {pickups.map((pickup) => (
                  <label key={pickup.id} className={`${optionClassName} ${selectedPickupId === pickup.id ? "border-amber-700 bg-amber-50 ring-1 ring-amber-700" : "border-stone-300"}`}>
                    <input type="radio" name="groupBuyPickupId" value={pickup.id} required checked={selectedPickupId === pickup.id} onChange={() => setSelectedPickupId(pickup.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-800" />
                    <span className="min-w-0"><span role="heading" aria-level={3} className="block font-bold">{pickup.pickupLocation.name}</span><span className="mt-1 block break-words text-stone-700">{pickup.pickupLocation.address}</span><span className="mt-2 block text-sm text-stone-600">取貨時間：{pickupTime(pickup)}</span></span>
                  </label>
                ))}
              </div>
            )}
            {fulfillmentMethod === "SEVEN_ELEVEN" && (
              <div className="mt-5">
                {selectedSevenElevenStore ? (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
                    <p className="font-bold">7-ELEVEN {selectedSevenElevenStore.name}</p>
                    <p className="mt-2 text-sm">店號：{selectedSevenElevenStore.id}</p>
                    <p className="mt-1 break-words text-sm">地址：{selectedSevenElevenStore.address}</p>
                    <input type="hidden" name="storeSelectionToken" value={selectedSevenElevenStore.selectionToken} />
                    <button type="submit" formAction={startSevenElevenStoreSelectionAction.bind(null, slug)} formNoValidate onClick={saveDraftBeforeStoreSelection} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-700 bg-white px-4 py-2 font-bold text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">重新選擇門市</button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5">
                    <p className="font-bold text-stone-900">尚未選擇 7-ELEVEN 門市</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">請先選擇方便取件的門市，再繼續確認訂單。</p>
                    <button type="submit" formAction={startSevenElevenStoreSelectionAction.bind(null, slug)} formNoValidate onClick={saveDraftBeforeStoreSelection} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-700 bg-white px-4 py-2 font-bold text-amber-900 transition hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">選擇 7-ELEVEN 門市</button>
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <fieldset className="py-6 sm:py-8">
            <legend className="w-full"><StepTitle number="4" title="聯絡資料" description="用於確認訂單與取貨聯繫。" /></legend>
            <div className="mt-4 grid gap-4 sm:mt-5 sm:grid-cols-2 sm:gap-5">
              <div className="space-y-2">
                <label htmlFor="customerName" className="block font-bold">訂購人姓名 <span aria-hidden="true" className="text-red-700">*</span></label>
                <input aria-label="訂購人姓名" id="customerName" name="customerName" required autoComplete="name" placeholder="請輸入姓名" value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={inputClassName} />
              </div>
              <div className="space-y-2">
                <label htmlFor="customerPhone" className="block font-bold">手機號碼 <span aria-hidden="true" className="text-red-700">*</span></label>
                <input aria-label="手機號碼" id="customerPhone" name="customerPhone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="例如：0912-345-678" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className={inputClassName} />
              </div>
            </div>
          </fieldset>

          <div className="pt-6 sm:pt-8">
            <StepTitle number="5" title="確認訂單" />
            {selectedItems.length === 0 ? (
              <div aria-label="訂單摘要" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                <p className="font-medium text-stone-700">尚未選擇商品</p>
                <p><span>總數量 0</span><span aria-hidden="true"> · </span><span>訂單總額 <strong className="text-amber-800">$0</strong></span></p>
              </div>
            ) : (
              <div aria-label="訂單摘要" className="mt-5 rounded-2xl border border-stone-200 bg-stone-50/70 p-5 text-stone-900 shadow-sm sm:p-6">
                <div className="space-y-3">
                  {selectedItems.map(({ item, quantity, subtotal }) => (
                    <div key={item.id} className="flex items-start justify-between gap-4 text-sm"><p className="min-w-0"><span className="font-bold">{item.product.name}</span><span className="ml-2 text-stone-500">× {quantity}</span></p><p className="shrink-0 font-semibold">{formatPrice(subtotal)}</p></div>
                  ))}
                </div>
                <dl className="mt-5 grid gap-3 border-t border-stone-200 pt-5 text-sm sm:grid-cols-2">
                  <div><dt className="text-stone-500">總數量</dt><dd className="mt-1 font-bold">{totalQuantity}</dd></div>
                  <div><dt className="text-stone-500">訂單總額</dt><dd className="mt-1 text-xl font-bold text-amber-800">{formatPrice(estimatedTotal)}</dd></div>
                  <div><dt className="text-stone-500">取貨方式</dt><dd className="mt-1 font-bold">{fulfillmentMethod === "SELF_PICKUP" ? "自取" : "7-ELEVEN 門市取貨"}</dd></div>
                  <div><dt className="text-stone-500">取貨地點</dt><dd className="mt-1 break-words font-bold">{fulfillmentMethod === "SELF_PICKUP" ? selectedPickup?.pickupLocation.name ?? "尚未選擇" : selectedSevenElevenStore ? `7-ELEVEN ${selectedSevenElevenStore.name}` : "尚未選擇門市"}</dd></div>
                  {(customerName.trim() || customerPhone.trim()) && <div className="sm:col-span-2"><dt className="text-stone-500">訂購人</dt><dd className="mt-1 break-words font-bold">{customerName.trim() || "尚未填寫姓名"}{customerPhone.trim() ? ` · ${customerPhone.trim()}` : ""}</dd></div>}
                </dl>
              </div>
            )}
            {state.status === "error" && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-800">{state.message}</p>}
            <div className="mt-5">
              <button data-testid="desktop-submit" type="submit" disabled={pending} className="mt-4 hidden min-h-12 items-center justify-center rounded-xl bg-amber-700 px-5 py-3 font-bold text-white transition hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-60 sm:inline-flex sm:min-w-40">{pending ? "送出中…" : "送出訂單"}</button>
            </div>
          </div>

          <div data-testid="mobile-submit-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 shadow-[0_-6px_20px_rgba(28,25,23,0.08)] backdrop-blur sm:hidden">
            <div className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="min-w-0">
                <p className="text-xs text-stone-500">訂單總額</p>
                <p className="truncate font-bold text-amber-800">{formatPrice(estimatedTotal)}</p>
              </div>
              <button data-testid="mobile-submit" type="submit" disabled={pending} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-amber-700 px-4 py-2.5 font-bold text-white transition hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-wait disabled:opacity-60">{pending ? "送出中…" : "送出訂單"}</button>
            </div>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

export function PublicOrderForm(props: PublicOrderFormProps) {
  const [state, formAction, pending] = useActionState(submitPublicOrderAction, initialPublicOrderActionState);
  return <PublicOrderFormView {...props} state={state} pending={pending} formAction={formAction} />;
}
