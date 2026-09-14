"use client";

import { useActionState } from "react";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";
import { submitPublicOrderAction } from "./actions";
import {
  initialPublicOrderActionState,
  type PublicOrderActionState,
} from "./order-action-state";

type PublicOrderItem = Readonly<{
  id: string;
  salePrice: number;
  stock: number | null;
  purchaseLimit: number | null;
  product: Readonly<{ name: string; unit: string }>;
}>;

type PublicOrderPickup = Readonly<{
  id: string;
  pickupStartAt: Date | null;
  pickupEndAt: Date | null;
  pickupLocation: Readonly<{ name: string; address: string }>;
}>;

export type PublicOrderFormProps = Readonly<{
  slug: string;
  items: readonly PublicOrderItem[];
  pickups: readonly PublicOrderPickup[];
}>;

type PublicOrderFormViewProps = PublicOrderFormProps & Readonly<{
  state: PublicOrderActionState;
  pending: boolean;
  formAction: (formData: FormData) => void;
}>;

const inputClassName = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:bg-stone-100";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function quantityMaximum(item: PublicOrderItem): number | undefined {
  const limits = [item.stock, item.purchaseLimit].filter(
    (value): value is number => value !== null,
  );
  return limits.length > 0 ? Math.min(...limits) : undefined;
}

function pickupTime(pickup: PublicOrderPickup): string {
  return pickup.pickupStartAt && pickup.pickupEndAt
    ? `${taipeiDisplayFormatter.format(pickup.pickupStartAt)}－${taipeiDisplayFormatter.format(pickup.pickupEndAt)}`
    : "取貨時間另行通知";
}

export function PublicOrderFormView({
  slug,
  items,
  pickups,
  state,
  pending,
  formAction,
}: PublicOrderFormViewProps) {
  if (state.status === "success") {
    return (
      <section
        aria-live="polite"
        role="status"
        className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950"
      >
        <h2 className="text-2xl font-bold">訂購成功</h2>
        <p className="mt-3">訂單參考編號：<strong>{state.publicCode}</strong></p>
        <p className="mt-1">訂單總額：<strong>{formatPrice(state.totalAmount)}</strong></p>
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-stone-950">
          <p>訂單管理碼：<strong className="break-all font-mono">{state.managementCode}</strong></p>
          <p className="mt-2 text-sm font-medium">此管理碼等同訂單管理密碼，請妥善保存並勿分享。</p>
        </div>
        <p className="mt-3 text-sm">訂單參考編號僅供識別，不能作為管理憑證。</p>
        <a
          href={`/orders/${state.publicCode}`}
          className="mt-5 inline-flex rounded-lg bg-emerald-800 px-4 py-2 font-bold text-white hover:bg-emerald-900"
        >
          查看訂單
        </a>
      </section>
    );
  }

  return (
    <section aria-labelledby="order-heading" className="mt-8 border-t border-stone-200 pt-8">
      <h2 id="order-heading" className="text-2xl font-bold">填寫訂購資料</h2>
      <form action={formAction} aria-busy={pending} className="mt-5 space-y-6">
        <input type="hidden" name="groupBuySlug" value={slug} />
        <fieldset disabled={pending} className="space-y-6 disabled:opacity-60">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="customerName" className="block font-medium">訂購人姓名</label>
              <input id="customerName" name="customerName" required autoComplete="name" className={inputClassName} />
            </div>
            <div className="space-y-2">
              <label htmlFor="customerPhone" className="block font-medium">手機號碼</label>
              <input id="customerPhone" name="customerPhone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="0912-345-678" className={inputClassName} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="font-bold">選擇取貨地點</legend>
            {pickups.map((pickup, index) => (
              <label key={pickup.id} className="flex cursor-pointer gap-3 rounded-xl border border-stone-200 p-4">
                <input
                  type="radio"
                  name="groupBuyPickupId"
                  value={pickup.id}
                  required
                  defaultChecked={index === 0}
                  className="mt-1"
                />
                <span>
                  <span className="block font-bold">{pickup.pickupLocation.name}</span>
                  <span className="block text-stone-600">{pickup.pickupLocation.address}</span>
                  <span className="mt-1 block text-sm text-stone-500">{pickupTime(pickup)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-4">
            <h3 className="font-bold">商品數量</h3>
            {items.map((item) => {
              const unavailable = item.stock === 0 || item.purchaseLimit === 0;
              const unavailableText = item.stock === 0 ? "已無庫存" : "目前不可購買";
              const max = quantityMaximum(item);
              return (
                <div key={item.id} className="grid gap-3 rounded-xl border border-stone-200 p-4 sm:grid-cols-[1fr_9rem] sm:items-end">
                  <div>
                    <p className="font-bold">{item.product.name}</p>
                    <p className="text-sm text-stone-600">{formatPrice(item.salePrice)}／{item.product.unit}</p>
                    {unavailable && <p className="mt-1 text-sm font-medium text-red-700">{unavailableText}</p>}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={`quantity-${item.id}`} className="block text-sm font-medium">
                      {item.product.name}數量
                    </label>
                    <input
                      id={`quantity-${item.id}`}
                      name={`item:${item.id}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={max}
                      step="1"
                      defaultValue=""
                      disabled={unavailable}
                      className={inputClassName}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {state.status === "error" && (
            <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{state.message}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-amber-800 px-5 py-3 font-bold text-white hover:bg-amber-900 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "訂單送出中…" : "送出訂單"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

export function PublicOrderForm(props: PublicOrderFormProps) {
  const [state, formAction, pending] = useActionState(
    submitPublicOrderAction,
    initialPublicOrderActionState,
  );
  return (
    <PublicOrderFormView
      {...props}
      state={state}
      pending={pending}
      formAction={formAction}
    />
  );
}
