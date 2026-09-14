import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { Card, PageHeader } from "@/components/ui/primitives";

const shortcuts = [
  { href: "/admin/orders", title: "處理訂單", description: "確認收款、完成取貨或處理取消。" },
  { href: "/admin/group-buys", title: "管理團購", description: "建立草稿、安排商品與取貨地點。" },
  { href: "/admin/products", title: "維護商品", description: "更新商品、價格、成本與供應商資料。" },
] as const;

export default async function AdminPage() {
  const admin = await requireAdmin();
  return (
    <section>
      <PageHeader eyebrow="Operations" title="營運首頁" description="從這裡快速前往每天最常使用的管理功能。" />
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {shortcuts.map((item) => (
          <Card key={item.href} className="group p-5 transition hover:border-indigo-200 hover:shadow-md">
            <h2 className="text-lg font-bold text-slate-950">{item.title}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{item.description}</p>
            <Link href={item.href} className="mt-5 inline-flex text-sm font-bold text-indigo-700 hover:text-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">前往處理 <span aria-hidden="true" className="ml-1 transition group-hover:translate-x-1">→</span></Link>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">管理員帳號</p>
        <p className="mt-2 break-all font-semibold text-slate-900">{admin.email}</p>
      </Card>
    </section>
  );
}
