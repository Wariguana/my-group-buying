"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { GroupBuyFormState } from "./actions";
import { buttonStyles, fieldStyles } from "@/components/ui/primitives";

type ProductOption = { id: string; name: string; unit: string; defaultPrice: number; cost: number; isActive: boolean };
type PickupOption = { id: string; name: string; address: string; isActive: boolean };
type ItemValue = { productId: string; salePrice: string; stock: string; purchaseLimit: string };
type PickupValue = { pickupLocationId: string; pickupStartAt: string; pickupEndAt: string };

export type GroupBuyFormValues = {
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  startAt: string;
  endAt: string;
  items: ItemValue[];
  pickups: PickupValue[];
};

type Props = {
  action: (state: GroupBuyFormState, formData: FormData) => Promise<GroupBuyFormState>;
  submitLabel: string;
  productOptions: ProductOption[];
  pickupOptions: PickupOption[];
  values?: GroupBuyFormValues;
};

const initialState: GroupBuyFormState = { fieldErrors: {}, formError: null };
const inputClassName = fieldStyles;

export function GroupBuyForm({ action, submitLabel, productOptions, pickupOptions, values }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [items, setItems] = useState<ItemValue[]>(values?.items ?? []);
  const [pickups, setPickups] = useState<PickupValue[]>(values?.pickups ?? []);

  function addItem() {
    const option = productOptions.find((product) => !items.some((item) => item.productId === product.id));
    if (option) setItems([...items, { productId: option.id, salePrice: String(option.defaultPrice), stock: "", purchaseLimit: "" }]);
  }

  function addPickup() {
    const option = pickupOptions.find((location) => !pickups.some((pickup) => pickup.pickupLocationId === location.id));
    if (option) setPickups([...pickups, { pickupLocationId: option.id, pickupStartAt: "", pickupEndAt: "" }]);
  }

  return (
    <form action={formAction} className="mt-7 space-y-6" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-6 disabled:opacity-60">
        <section aria-labelledby="basics-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="basics-heading" className="text-lg font-bold text-slate-950">基本資料</h2>
          <p className="mt-1 text-sm text-slate-600">顧客會看到名稱、說明、封面與訂購期間。</p>
          <div className="mt-5 max-w-3xl space-y-5">
          <Field label="團購名稱" name="title" required errors={state.fieldErrors.title}>
            <input id="title" name="title" required defaultValue={values?.title} className={inputClassName} />
          </Field>
          <Field label="說明" name="description" errors={state.fieldErrors.description}>
            <textarea id="description" name="description" rows={5} defaultValue={values?.description ?? ""} className={inputClassName} />
          </Field>
          <Field label="封面圖片網址" name="coverImageUrl" errors={state.fieldErrors.coverImageUrl}>
            <input id="coverImageUrl" name="coverImageUrl" type="url" inputMode="url" defaultValue={values?.coverImageUrl ?? ""} className={inputClassName} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="開始時間" name="startAt" required errors={state.fieldErrors.startAt}>
              <input id="startAt" name="startAt" type="datetime-local" required defaultValue={values?.startAt} className={inputClassName} />
            </Field>
            <Field label="結束時間" name="endAt" required errors={state.fieldErrors.endAt}>
              <input id="endAt" name="endAt" type="datetime-local" required defaultValue={values?.endAt} className={inputClassName} />
            </Field>
          </div>
            <p className="text-sm text-slate-600">所有時間均為台灣時間（UTC+8）。</p>
          </div>
        </section>

        <input type="hidden" name="items" value={JSON.stringify(items)} />
        <section aria-labelledby="items-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="items-heading" className="text-xl font-semibold">商品列表</h3>
            <button type="button" onClick={addItem} disabled={!productOptions.some((product) => !items.some((item) => item.productId === product.id))} className={buttonStyles.secondary}>新增商品</button>
          </div>
          {state.fieldErrors.items?.map((error) => <p role="alert" key={error} className="text-sm text-red-700 dark:text-red-400">{error}</p>)}
          {items.length === 0 ? <p className="rounded-md border border-dashed border-zinc-400 p-5 text-zinc-600 dark:text-zinc-400">草稿可暫時沒有商品。</p> : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={`${index}-${item.productId}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <label className="md:col-span-2"><span className="mb-2 block text-sm font-medium">商品</span><select aria-label={`商品 ${index + 1}`} value={item.productId} onChange={(event) => {
                      const option = productOptions.find((product) => product.id === event.target.value);
                      setItems(items.map((current, currentIndex) => currentIndex === index ? { ...current, productId: event.target.value, salePrice: option ? String(option.defaultPrice) : current.salePrice } : current));
                    }} className={inputClassName}>{productOptions.map((product) => <option key={product.id} value={product.id}>{product.name}／{product.unit}{product.isActive ? "" : "（已停用）"}</option>)}</select></label>
                    <RowInput label="售價" value={item.salePrice} onChange={(value) => setItems(replace(items, index, { ...item, salePrice: value }))} />
                    <RowInput label="庫存（空白為不限）" value={item.stock} onChange={(value) => setItems(replace(items, index, { ...item, stock: value }))} />
                    <RowInput label="每人限購（空白為不限）" value={item.purchaseLimit} onChange={(value) => setItems(replace(items, index, { ...item, purchaseLimit: value }))} />
                  </div>
                  <OrderButtons index={index} length={items.length} onMove={(target) => setItems(move(items, index, target))} onRemove={() => setItems(items.filter((_, currentIndex) => currentIndex !== index))} />
                </div>
              ))}
            </div>
          )}
        </section>

        <input type="hidden" name="pickups" value={JSON.stringify(pickups)} />
        <section aria-labelledby="pickups-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="pickups-heading" className="text-xl font-semibold">取貨地點列表</h3>
            <button type="button" onClick={addPickup} disabled={!pickupOptions.some((location) => !pickups.some((pickup) => pickup.pickupLocationId === location.id))} className={buttonStyles.secondary}>新增取貨地點</button>
          </div>
          {state.fieldErrors.pickups?.map((error) => <p role="alert" key={error} className="text-sm text-red-700 dark:text-red-400">{error}</p>)}
          {pickups.length === 0 ? <p className="rounded-md border border-dashed border-zinc-400 p-5 text-zinc-600 dark:text-zinc-400">草稿可暫時沒有取貨地點。</p> : (
            <div className="space-y-4">
              {pickups.map((pickup, index) => (
                <div key={`${index}-${pickup.pickupLocationId}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <label><span className="mb-2 block text-sm font-medium">取貨地點</span><select aria-label={`取貨地點 ${index + 1}`} value={pickup.pickupLocationId} onChange={(event) => setPickups(replace(pickups, index, { ...pickup, pickupLocationId: event.target.value }))} className={inputClassName}>{pickupOptions.map((location) => <option key={location.id} value={location.id}>{location.name}／{location.address}{location.isActive ? "" : "（已停用）"}</option>)}</select></label>
                    <DateInput label="取貨開始時間" value={pickup.pickupStartAt} onChange={(value) => setPickups(replace(pickups, index, { ...pickup, pickupStartAt: value }))} />
                    <DateInput label="取貨結束時間" value={pickup.pickupEndAt} onChange={(value) => setPickups(replace(pickups, index, { ...pickup, pickupEndAt: value }))} />
                  </div>
                  <OrderButtons index={index} length={pickups.length} onMove={(target) => setPickups(move(pickups, index, target))} onRemove={() => setPickups(pickups.filter((_, currentIndex) => currentIndex !== index))} />
                </div>
              ))}
            </div>
          )}
        </section>

        {state.formError && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{state.formError}</p>}
        <div className="sticky bottom-3 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur"><button type="submit" disabled={pending} className={buttonStyles.primary}>{pending ? "儲存中…" : submitLabel}</button><Link href="/admin/group-buys" className={buttonStyles.secondary}>取消</Link></div>
      </fieldset>
    </form>
  );
}

function replace<T>(values: T[], index: number, value: T) { return values.map((current, currentIndex) => currentIndex === index ? value : current); }
function move<T>(values: T[], from: number, to: number) { const next = [...values]; const [value] = next.splice(from, 1); next.splice(to, 0, value); return next; }

function Field({ label, name, required = false, errors, children }: { label: string; name: "title" | "description" | "coverImageUrl" | "startAt" | "endAt"; required?: boolean; errors?: string[]; children: React.ReactNode }) {
  return <div className="space-y-2"><label htmlFor={name} className="block text-sm font-semibold text-slate-700">{label}{required ? " *" : ""}</label>{children}{errors?.map((error) => <p role="alert" key={error} className="text-sm font-medium text-red-700">{error}</p>)}</div>;
}
function RowInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="mb-2 block text-sm font-medium">{label}</span><input type="number" inputMode="numeric" min="0" max="2147483647" step="1" value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName} /></label>; }
function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="mb-2 block text-sm font-medium">{label}</span><input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName} /></label>; }
function OrderButtons({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (target: number) => void; onRemove: () => void }) { return <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} className="rounded border border-zinc-400 px-3 py-1 text-sm disabled:opacity-40">上移</button><button type="button" disabled={index === length - 1} onClick={() => onMove(index + 1)} className="rounded border border-zinc-400 px-3 py-1 text-sm disabled:opacity-40">下移</button><button type="button" onClick={onRemove} className="rounded border border-red-400 px-3 py-1 text-sm text-red-700 dark:text-red-400">移除</button></div>; }
