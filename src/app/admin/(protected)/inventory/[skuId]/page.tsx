import { buttonStyles, titleStyles } from "@/components/ui/primitives";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { getDb } from "@/lib/db";
import { id } from "@/lib/commerce/validation";

export const dynamic = "force-dynamic";

export default async function InventoryHistoryPage({ params, searchParams }: PageProps<"/admin/inventory/[skuId]">) {
  await requireAdmin();
  const skuId = id.safeParse((await params).skuId);
  const rawCursor = (await searchParams).cursor;
  const cursor = rawCursor === undefined ? null : id.safeParse(rawCursor);
  if (!skuId.success || cursor && !cursor.success) notFound();
  const db = getDb();
  const sku = await db.productSku.findUnique({ where: { id: skuId.data }, select: { code: true, productId: true, product: { select: { name: true } } } });
  if (!sku) notFound();
  const cursorId = cursor?.success ? cursor.data : null;
  if (cursorId && !await db.inventoryMovement.findFirst({ where: { id: cursorId, skuId: skuId.data }, select: { id: true } })) notFound();
  const rows = await db.inventoryMovement.findMany({ where: { skuId: skuId.data },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    include: { actor: { select: { email: true } } },
  });
  const visible = rows.slice(0, 30);
  return <section className="space-y-5">
    <Link className={buttonStyles.secondary} href={`/admin/commerce?product=${sku.productId}`}>← 返回商品庫存</Link>
    <h1 className={titleStyles.page}>SKU 庫存流水帳</h1><p>{sku.product.name}／{sku.code}</p>
    <div role="region" aria-label="完整庫存流水帳（可水平捲動）" tabIndex={0} className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[44rem] text-left text-sm"><thead><tr>{["時間", "操作", "調整前 → 後", "預留／占用", "原因", "操作者"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
      <tbody>{visible.map((m) => <tr key={m.id} className="border-t"><td className="p-3">{m.createdAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</td><td className="p-3">{m.kind}</td><td className="p-3">{m.beforeOnHand} → {m.afterOnHand}</td><td className="p-3">{m.reserved}／{m.allocated}</td><td className="p-3">{m.reason}</td><td className="p-3">{m.actor?.email ?? "顧客／系統"}</td></tr>)}</tbody>
    </table></div>
    {!visible.length && <p>尚無庫存異動紀錄。</p>}
    <nav aria-label="庫存紀錄翻頁" className="flex flex-wrap gap-5">
      {cursorId && <Link className={buttonStyles.secondary} href={`/admin/inventory/${skuId.data}`}>回最新紀錄</Link>}
      {rows.length > 30 && <Link className={buttonStyles.secondary} href={`/admin/inventory/${skuId.data}?cursor=${visible[29].id}`}>較早紀錄 →</Link>}
    </nav>
  </section>;
}
