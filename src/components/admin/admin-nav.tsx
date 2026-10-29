"use client";

import { buttonStyles, linkStyles } from "@/components/ui/primitives";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const groups = [
  { label: "總覽", links: [{ href: "/admin", label: "營運首頁" }] },
  { label: "訂單與交易", links: [
    { href: "/admin/qbuy", label: "QB 訂單、取消退款與履約" },
    { href: "/admin/payments", label: "銀行轉帳核帳" },
    { href: "/admin/orders", label: "舊制訂單管理" },
  ] },
  { label: "商品與開團", links: [
    { href: "/admin/group-buys", label: "團購管理" },
    { href: "/admin/products", label: "商品管理" },
    { href: "/admin/commerce", label: "SKU／分類／庫存" },
    { href: "/admin/suppliers", label: "供應商管理" },
  ] },
  { label: "營運設定", links: [
    { href: "/admin/pickup-locations", label: "取貨地點管理" },
    { href: "/admin/payments?settings=1#settings", label: "銀行與配送設定" },
  ] },
  { label: "系統管理", links: [{ href: "/admin/operations", label: "平台監控" }] },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 pb-3 lg:px-3">
      <button type="button" className={`${buttonStyles.secondary} w-full lg:hidden`} aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(!open)}>{open ? "收合管理選單" : "開啟管理選單"}</button>
      <nav id="admin-navigation" aria-label="管理後台導覽" className={`${open ? "grid" : "hidden"} mt-3 gap-4 sm:grid-cols-2 lg:mt-0 lg:block lg:space-y-4`}>
        {groups.map(group => <div key={group.label}>
          <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-slate-400">{group.label}</p>
          <ul className="space-y-1">{group.links.map(link => {
            const active = !link.href.includes("#") && (link.href === "/admin" ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`) || (link.href === "/admin/commerce" && pathname.startsWith("/admin/inventory/")));
            return <li key={link.href}><Link href={link.href} aria-current={active ? "page" : undefined} className={`${linkStyles.adminNav} w-full`} onClick={() => setOpen(false)}>{link.label}</Link></li>;
          })}</ul>
        </div>)}
      </nav>
    </div>
  );
}
