"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "營運首頁", exact: true },
  { href: "/admin/orders", label: "訂單管理", exact: false },
  { href: "/admin/group-buys", label: "團購管理", exact: false },
  { href: "/admin/products", label: "商品管理", exact: false },
  { href: "/admin/suppliers", label: "供應商管理", exact: false },
  { href: "/admin/pickup-locations", label: "取貨地點管理", exact: false },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="管理後台導覽" className="flex gap-1 overflow-x-auto px-4 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
      {links.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
