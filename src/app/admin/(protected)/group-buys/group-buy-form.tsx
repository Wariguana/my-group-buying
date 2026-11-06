"use client";

/* Legacy external URLs require plain img elements; remote next/image allowlists cannot safely enumerate them. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import styles from "@/components/admin/admin.module.css";
import { useActionState, useRef, useState } from "react";
import type { GroupBuyFormState } from "./actions";
import { buttonStyles, fieldStyles } from "@/components/ui/primitives";

type ProductOption = { id: string; name: string; unit: string; defaultPrice: number; cost: number; isActive: boolean };
type PickupOption = { id: string; name: string; address: string; isActive: boolean };
type ItemValue = { productId: string; salePrice: string; stock: string; purchaseLimit: string };
type PickupValue = { pickupLocationId: string; pickupStartAt: string; pickupEndAt: string };
export type GalleryValue =
  | { kind: "existing"; id: string; imageUrl: string }
  | { kind: "pending"; uploadId: string; imageUrl: string };

export type GroupBuyFormValues = {
  title: string;
  description: string | null;
  gallery: GalleryValue[];
  startAt: string;
  endAt: string;
  allowsSelfPickup: boolean;
  allowsSevenEleven: boolean;
  items: ItemValue[];
  pickups: PickupValue[];
};

type Props = {
  action: (state: GroupBuyFormState, formData: FormData) => Promise<GroupBuyFormState>;
  submitLabel: string;
  productOptions?: ProductOption[];
  pickupOptions?: PickupOption[];
  values?: GroupBuyFormValues;
  stockLocked?: boolean;
  skuOfferCount?: number;
};

const initialState: GroupBuyFormState = { fieldErrors: {}, formError: null };
const inputClassName = fieldStyles;

export function GroupBuyForm({ action, submitLabel, values, skuOfferCount = 0 }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const items = values?.items ?? [];
  const pickups = values?.pickups ?? [];
  const [gallery, setGallery] = useState<GalleryValue[]>(values?.gallery ?? []);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const allowsSelfPickup = values?.allowsSelfPickup ?? true;
  const [allowsSevenEleven, setAllowsSevenEleven] = useState(values?.allowsSevenEleven ?? false);

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    const selected = [...files].slice(0, Math.max(0, 8 - gallery.length));
    const errors: string[] = files.length > selected.length ? ["每個團購最多 8 張圖片。"] : [];
    let next = [...gallery];
    setUploadErrors([]);
    setUploadProgress({ current: 0, total: selected.length });
    for (const [index, file] of selected.entries()) {
      try {
        const body = new FormData();
        body.set("image", file);
        const response = await fetch("/api/admin/group-buy-images", { method: "POST", body });
        const payload = await response.json() as { id?: string; imageUrl?: string; error?: string };
        if (!response.ok || !payload.id || !payload.imageUrl) throw new Error(payload.error ?? "上傳失敗。");
        next = [...next, { kind: "pending", uploadId: payload.id, imageUrl: payload.imageUrl }];
        setGallery(next);
      } catch (error) {
        errors.push(`${file.name}：${error instanceof Error ? error.message : "上傳失敗。"}`);
      }
      setUploadProgress({ current: index + 1, total: selected.length });
    }
    setUploadErrors(errors);
    setUploadProgress(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <form action={formAction} className="mt-7 space-y-6" aria-busy={pending}>
      <fieldset disabled={pending} className="min-w-0 space-y-6 disabled:opacity-60">
        <section aria-labelledby="basics-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="basics-heading" className="text-lg font-bold text-slate-950">基本資料</h2>
          <p className="mt-1 text-sm text-slate-600">顧客會看到名稱、說明、商品圖片與訂購期間。</p>
          <div className="mt-5 max-w-3xl space-y-5">
          <Field label="團購名稱" name="title" required errors={state.fieldErrors.title}>
            <input id="title" name="title" required defaultValue={values?.title} className={inputClassName} />
          </Field>
          <Field label="說明" name="description" errors={state.fieldErrors.description}>
            <textarea id="description" name="description" rows={5} defaultValue={values?.description ?? ""} className={inputClassName} />
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

        <input type="hidden" name="gallery" value={JSON.stringify(gallery.map((image) => image.kind === "existing" ? { kind: image.kind, id: image.id } : { kind: image.kind, uploadId: image.uploadId }))} />
        <section aria-labelledby="gallery-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-busy={uploadProgress !== null}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 id="gallery-heading" className="text-xl font-semibold">商品圖片</h3><p className="mt-1 text-sm text-slate-600">第一張是封面，最多 8 張圖片。</p></div>
            <label className={`${buttonStyles.secondary} ${gallery.length >= 8 || uploadProgress ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              選擇圖片上傳
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={gallery.length >= 8 || uploadProgress !== null} onChange={(event) => void uploadImages(event.target.files)} />
            </label>
          </div>
          {uploadProgress && <p role="status" className="text-sm font-medium text-amber-800">正在上傳 {uploadProgress.current} / {uploadProgress.total}</p>}
          {uploadErrors.map((message) => <p role="alert" key={message} className="text-sm text-red-700">{message}</p>)}
          {state.fieldErrors.gallery?.map((error) => <p role="alert" key={error} className="text-sm text-red-700">{error}</p>)}
          {gallery.length === 0 ? <p className="rounded-md border border-dashed border-zinc-400 p-5 text-zinc-600">可稍後再上傳圖片。</p> : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {gallery.map((image, index) => (
                <li key={image.kind === "existing" ? image.id : image.uploadId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-stone-100"><img src={image.imageUrl} alt={`商品圖片 ${index + 1}`} className="h-full w-full object-contain" /></div>
                  <div className="mt-3 flex min-h-6 items-center justify-between gap-2 text-sm"><span>圖片 {index + 1}</span>{index === 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">封面</span>}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {index > 0 && <button type="button" onClick={() => setGallery(move(gallery, index, 0))} className="rounded border border-amber-500 px-2 py-1 text-xs font-medium text-amber-900">設為封面</button>}
                    <button type="button" aria-label={`圖片 ${index + 1} 上移`} disabled={index === 0} onClick={() => setGallery(move(gallery, index, index - 1))} className="rounded border border-zinc-400 px-2 py-1 text-xs disabled:opacity-40">上移</button>
                    <button type="button" aria-label={`圖片 ${index + 1} 下移`} disabled={index === gallery.length - 1} onClick={() => setGallery(move(gallery, index, index + 1))} className="rounded border border-zinc-400 px-2 py-1 text-xs disabled:opacity-40">下移</button>
                    <button type="button" aria-label={`移除圖片 ${index + 1}`} onClick={() => setGallery(gallery.filter((_, current) => current !== index))} className="rounded border border-red-400 px-2 py-1 text-xs text-red-700">移除</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-slate-500">最多 8 張圖片</p>
        </section>

        <input type="hidden" name="items" value={JSON.stringify(items)} />
        <input type="hidden" name="pickups" value={JSON.stringify(pickups)} />
        {allowsSelfPickup && <input type="hidden" name="allowsSelfPickup" value="on" />}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-slate-950">商品規格與配送</h2>
          <p className="text-sm leading-6 text-stone-700">目前有 {skuOfferCount} 項有效 SKU 販售規格。基本資料儲存後，請至「商品規格與庫存」設定販售規格、價格及庫存；配送能力與費率由銀行與配送設定維護。</p>
          <Link href="/admin/commerce" className={buttonStyles.secondary}>管理商品規格與庫存</Link>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
            <input type="checkbox" name="allowsSevenEleven" checked={allowsSevenEleven} onChange={event => setAllowsSevenEleven(event.target.checked)} className="mt-1" />
            <span><span className="block font-semibold">開放 7-ELEVEN 門市選擇</span><span className="text-sm text-slate-600">新版結帳選擇此團的門市時，仍須通過商品規格、配送能力及溫層檢查。</span></span>
          </label>
          {state.fieldErrors.items?.map(error => <p role="alert" key={error} className="text-sm font-medium text-red-700">{error}</p>)}
        </section>
        {state.formError && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{state.formError}</p>}
        <div className={`${styles.stickyActions} sticky bottom-3 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur`}><button type="submit" disabled={pending} className={buttonStyles.primary}>{pending ? "儲存中…" : submitLabel}</button><Link href="/admin/group-buys" className={buttonStyles.secondary}>取消</Link></div>
      </fieldset>
    </form>
  );
}

function move<T>(values: T[], from: number, to: number) { const next = [...values]; const [value] = next.splice(from, 1); next.splice(to, 0, value); return next; }

function Field({ label, name, required = false, errors, children }: { label: string; name: "title" | "description" | "startAt" | "endAt"; required?: boolean; errors?: string[]; children: React.ReactNode }) {
  return <div className="space-y-2"><label htmlFor={name} className="block text-sm font-semibold text-slate-700">{label}{required ? " *" : ""}</label>{children}{errors?.map((error) => <p role="alert" key={error} className="text-sm font-medium text-red-700">{error}</p>)}</div>;
}
