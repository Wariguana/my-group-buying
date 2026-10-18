import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getDb } from "@/lib/db";
import { id, shippingMethods } from "@/lib/commerce/validation";
import { CommerceForm } from "./form";

export const dynamic = "force-dynamic";
const inputStyle = "block rounded border border-slate-300 px-2 py-2 text-sm max-w-full";
function Hidden({ name, value }: { name: string; value: string | number }) { return <input type="hidden" name={name} value={value} />; }
function Field({ name, label, value = "", type = "text", required = true }: { name: string; label: string; value?: string | number; type?: string; required?: boolean }) {
  return <label className="text-sm">{label}<input className={inputStyle} name={name} type={type} defaultValue={value} required={required} min={type === "number" ? 0 : undefined} /></label>;
}
function Active({ value = true }: { value?: boolean }) { return <label className="text-sm">狀態<select className={inputStyle} name="isActive" defaultValue={String(value)}><option value="true">啟用</option><option value="false">停用</option></select></label>; }

export default async function CommercePage({ searchParams }: PageProps<"/admin/commerce">) {
  await requireAdmin();
  const query = await searchParams;
  const productId = id.safeParse(query.product);
  const groupId = id.safeParse(query.group);
  const db = getDb();
  const [products, groups, categories, product, group] = await Promise.all([
    db.product.findMany({ select: { id: true, name: true, skuInventoryEnabled: true }, orderBy: { name: "asc" } }),
    db.groupBuy.findMany({ select: { id: true, title: true }, orderBy: { createdAt: "desc" } }),
    db.category.findMany({ include: { _count: { select: { groupBuys: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    productId.success ? db.product.findUnique({ where: { id: productId.data }, include: { options: { include: { values: true } },
      skus: { orderBy: { code: "asc" }, include: { options: { include: { optionValue: { include: { option: true } } } }, inventory: true,
        offers: { include: { groupBuy: { select: { title: true } } } }, movements: { include: { actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 30 } } } } }) : null,
    groupId.success ? db.groupBuy.findUnique({ where: { id: groupId.data }, include: { skuOffers: { include: { sku: { include: { product: true } } } } } }) : null,
  ]);
  const skus = group ? await db.productSku.findMany({ where: { product: { isActive: true } }, select: { id: true, code: true, product: { select: { name: true } } }, orderBy: { code: "asc" } }) : [];
  return <div className="space-y-8">
    <h1 className="text-3xl font-bold">QBUY 商品規格、分類與庫存</h1>
    <nav className="flex flex-wrap gap-4 underline"><Link href="/admin/products/new">新增商品</Link><Link href="/admin/group-buys/new">新增開團</Link><Link href="/admin/commerce">分類管理</Link></nav>
    <form className="flex flex-wrap gap-3"><label>選擇商品<select className={inputStyle} name="product" defaultValue={product?.id ?? ""}><option value="">選擇商品</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}／{p.skuInventoryEnabled ? "SKU 庫存" : "舊庫存，待盤點"}</option>)}</select></label><button className="underline">管理商品 SKU</button></form>
    <form className="flex flex-wrap gap-3"><label>選擇開團<select className={inputStyle} name="group" defaultValue={group?.id ?? ""}><option value="">選擇開團</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label><button className="underline">管理開團販售</button></form>
    {product && <section><h2 className="text-2xl font-bold">{product.name}：規格與 SKU</h2><Link className="underline" href={`/admin/products/${product.id}/edit`}>編輯商品資料</Link>
      <p className="my-3 text-sm">規格組合建立後保留身分，可停用而不刪除。選擇存在的組合即可，不會自動產生全排列。</p>
      {!product.skus.length && !product.options.length && <CommerceForm operation="defaultSku"><Hidden name="productId" value={product.id} /><p>無規格商品：建立固定 UUID 對應的預設 SKU</p></CommerceForm>}
      <CommerceForm operation="option"><Hidden name="productId" value={product.id} /><Field name="name" label="新增規格維度（顏色／尺寸）" /></CommerceForm>
      {product.options.map((o) => <div key={o.id}><h3 className="font-bold">{o.name}：{o.values.map((v) => v.value).join("、")}</h3><CommerceForm operation="value"><Hidden name="productId" value={product.id} /><Hidden name="optionId" value={o.id} /><Field name="value" label={`新增${o.name}選項`} /></CommerceForm></div>)}
      <CommerceForm operation="sku"><Hidden name="productId" value={product.id} /><Field name="code" label="新增 SKU code" />{product.options.map((o) => <label key={o.id}>{o.name}<select className={inputStyle} name="optionValueIds" required><option value="">選擇</option>{o.values.map((v) => <option key={v.id} value={v.id}>{v.value}</option>)}</select></label>)}</CommerceForm>
      {product.skus.map((s) => <article key={s.id} className="my-6 rounded-xl border border-slate-300 p-4"><h3 className="text-xl font-bold">{s.code}／{s.options.map((o) => `${o.optionValue.option.name}：${o.optionValue.value}`).join("、") || "預設規格"}</h3>
        <p>相關開團：{s.offers.map((o) => o.groupBuy.title).join("、") || "尚無"}</p>
        <CommerceForm operation="skuEdit" confirm><Hidden name="id" value={s.id} /><Field name="code" label="SKU code" value={s.code} /><Field name="displayName" label="顯示資訊" value={s.displayName ?? ""} required={false} /><Active value={s.isActive} />
          <label>溫層<select className={inputStyle} name="temperature" defaultValue={s.temperature}><option value="AMBIENT">常溫</option><option value="CHILLED">冷藏</option><option value="FROZEN">冷凍</option></select></label>
          <div>支援配送（僅資料準備，物流能力待確認）{shippingMethods.map((m) => <label className="block text-sm" key={m}><input type="checkbox" name="shippingMethods" value={m} defaultChecked={s.shippingMethods.includes(m)} />{m === "SEVEN_ELEVEN" ? "7-ELEVEN" : m === "FAMILY_MART" ? "全家" : "宅配"}</label>)}</div>
          <Field name="weightGrams" label="重量 g" type="number" required={false} value={s.weightGrams ?? ""} /><Field name="lengthMm" label="長 mm" type="number" required={false} value={s.lengthMm ?? ""} /><Field name="widthMm" label="寬 mm" type="number" required={false} value={s.widthMm ?? ""} /><Field name="heightMm" label="高 mm" type="number" required={false} value={s.heightMm ?? ""} /><Field name="shippingNote" label="配送限制" required={false} value={s.shippingNote ?? ""} />
        </CommerceForm>
        <h4 className="font-bold">全站共用庫存</h4><p>{s.inventory ? `實體 ${s.inventory.onHand} − 預留 ${s.inventory.reserved} − 已付款占用 ${s.inventory.allocated} = 可售 ${s.inventory.onHand - s.inventory.reserved - s.inventory.allocated}` : "未經盤點，不可販售"}</p>
        <p className="text-sm text-amber-900">起始盤點會停止此商品所有舊流程下單；未履約舊單必須先處理。其他未盤點 SKU 維持停售。</p>
        <CommerceForm operation="inventory" confirm><Hidden name="skuId" value={s.id} /><Hidden name="requestId" value={randomUUID()} /><Hidden name="expectedVersion" value={s.inventory?.version ?? 0} />
          <label>操作<select className={inputStyle} name="kind">{!s.inventory ? <option value="INITIAL">經核實的起始盤點</option> : <><option value="RESTOCK">補貨</option><option value="REDUCE">減少</option><option value="COUNT">盤點為指定數量</option></>}</select></label><Field name="value" label="數量" type="number" /><Field name="reason" label="原因（至少 3 字）" /><label><input type="checkbox" name="confirmed" value="yes" required />已核實實體數量及舊單</label>
        </CommerceForm>
        <Link className="my-3 inline-block underline" href={`/admin/inventory/${s.id}`}>查看完整庫存流水帳</Link>
        <details><summary>庫存異動紀錄（最近 30 筆）</summary><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["時間", "操作", "調整前 → 後", "預留／占用", "原因", "操作者"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{s.movements.map((m) => <tr key={m.id}><td className="p-2">{m.createdAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</td><td>{m.kind}</td><td>{m.beforeOnHand} → {m.afterOnHand}</td><td>{m.reserved}／{m.allocated}</td><td>{m.reason}</td><td>{m.actor.email}</td></tr>)}</tbody></table></div></details>
      </article>)}
    </section>}
    {group && <section><h2 className="text-2xl font-bold">{group.title}：開團販售</h2><Link className="underline" href={`/admin/group-buys/${group.id}/edit`}>編輯開團基本資料</Link>
      <p>目前：{group.isArchived ? "封存" : group.status === "DRAFT" ? "草稿" : group.status === "CANCELLED" ? "下架" : group.endAt <= new Date() ? "時間截止" : "上架"}</p>
      <CommerceForm operation="group" confirm><Hidden name="id" value={group.id} /><label>分類<select className={inputStyle} name="categoryId" defaultValue={group.categoryId ?? ""}><option value="">未分類</option>{categories.map((c) => <option key={c.id} value={c.id} disabled={!c.isActive && c.id !== group.categoryId}>{c.name}{!c.isActive && "（停用）"}</option>)}</select></label>
        <label>展示狀態<select className={inputStyle} name="visibility" defaultValue={group.isArchived ? "ARCHIVED" : group.status === "CANCELLED" ? "UNLISTED" : group.status}><option value="DRAFT">草稿</option><option value="PUBLISHED">上架</option><option value="UNLISTED">下架</option><option value="ARCHIVED">封存</option></select></label>
        <label>精選<select className={inputStyle} name="isFeatured" defaultValue={String(group.isFeatured)}><option value="false">一般</option><option value="true">精選</option></select></label><Field name="featuredSort" label="精選排序" type="number" value={group.featuredSort} />
        <label>允許合併配送<select className={inputStyle} name="allowsCombinedShipping" defaultValue={String(group.allowsCombinedShipping)}><option value="true">是</option><option value="false">否</option></select></label>
      </CommerceForm>
      <h3 className="font-bold">新增或更新販售 SKU</h3><CommerceForm operation="offer"><Hidden name="groupBuyId" value={group.id} /><label>SKU<select className={inputStyle} name="skuId" required><option value="">選擇 SKU</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.product.name}／{s.code}</option>)}</select></label><Field name="salePrice" label="開團價格 NT$" type="number" /><Field name="purchaseLimit" label="每次購物數量上限（空白不限）" type="number" required={false} /><Active /></CommerceForm>
      {group.skuOffers.map((o) => <div key={o.id}><p>{o.sku.product.name}／{o.sku.code}</p><CommerceForm operation="offer"><Hidden name="groupBuyId" value={group.id} /><Hidden name="skuId" value={o.skuId} /><Field name="salePrice" label="開團價格 NT$" value={o.salePrice} type="number" /><Field name="purchaseLimit" label="每次購物數量上限" type="number" value={o.purchaseLimit ?? ""} required={false} /><Active value={o.isActive} /></CommerceForm></div>)}
    </section>}
    <section><h2 className="text-2xl font-bold">分類管理</h2><CommerceForm operation="category"><Field name="name" label="新增分類" /><Field name="sortOrder" label="排序" type="number" value={0} /><Active /></CommerceForm>
      {categories.map((c) => <div key={c.id}><p>使用狀況：{c._count.groupBuys} 個開團（保留歷史引用，不提供永久刪除）</p><CommerceForm operation="category" confirm><Hidden name="id" value={c.id} /><Field name="name" label="分類名稱" value={c.name} /><Field name="sortOrder" label="排序" type="number" value={c.sortOrder} /><Active value={c.isActive} /></CommerceForm></div>)}
    </section>
  </div>;
}
