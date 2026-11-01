"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./admin.module.css";

const groups = [
  { title: "工作台", links: [{ href: "/admin", label: "工作總覽" }] },
  { title: "訂單與交易", links: [{ href: "/admin/qbuy", label: "訂單管理" }, { href: "/admin/payments", label: "付款確認" }] },
  { title: "商品與團購", links: [{ href: "/admin/group-buys", label: "團購管理" }, { href: "/admin/products", label: "商品管理" }, { href: "/admin/commerce", label: "商品規格與庫存" }, { href: "/admin/suppliers", label: "供應商管理" }] },
  { title: "營運設定", links: [{ href: "/admin/pickup-locations", label: "取貨地點" }, { href: "/admin/payments?settings=1#settings", label: "銀行與配送設定" }] },
  { title: "系統", links: [{ href: "/admin/operations", label: "系統狀態" }] },
] as const;
function Links({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <nav aria-label="管理後台導覽" className="space-y-5 px-3 pb-6">{groups.map(group => <section key={group.title}>
    <h2 className="px-3 text-xs font-medium tracking-wider text-stone-400">{group.title}</h2>
    <ul className="mt-2 space-y-1">{group.links.map(link => {
      const base = link.href.split("#")[0];
      const active = !link.href.includes("#") && (base === "/admin" ? pathname === base : pathname === base || pathname.startsWith(base + "/"));
      return <li key={link.href}><Link className={styles.navLink} href={link.href} aria-current={active ? "page" : undefined} onClick={onNavigate}>{link.label}</Link></li>;
    })}</ul>
  </section>)}</nav>;
}
export function AdminNav({ mode }: { mode: "mobile" | "desktop" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => { dialog.current?.close(); setOpen(false); };
  useEffect(() => {
    if (!open || mode !== "mobile") return;
    const node = dialog.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    const media = window.matchMedia("(min-width:1024px)");
    const resized = () => { if (media.matches) { node?.close(); setOpen(false); } };
    media.addEventListener("change", resized);
    return () => { node?.close(); document.body.style.overflow = previous; media.removeEventListener("change", resized); };
  }, [mode, open]);
  if (mode === "desktop") return <Links pathname={pathname} />;
  return <>
    <button ref={opener} type="button" aria-label="開啟管理選單" aria-expanded={open} aria-controls="adm-mobile-navigation" onClick={() => setOpen(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-500 text-xl focus-visible:outline-2 focus-visible:outline-white"><span aria-hidden="true">☰</span></button>
    <dialog ref={dialog} id="adm-mobile-navigation" aria-label="管理選單" className={styles.dialog} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]')).filter(n => n.getClientRects().length > 0);
      const first=nodes[0], last=nodes[nodes.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onCancel={e => { e.preventDefault(); close(); }} onClose={() => { setOpen(false); if (window.matchMedia("(max-width:1023px)").matches) opener.current?.focus(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.drawer}>
        <div className="flex items-center justify-between px-5 py-4"><div><p className="text-xs tracking-widest text-stone-400">QBUY</p><p className="mt-1 font-bold">管理選單</p></div><button type="button" onClick={close} aria-label="關閉管理選單" className="min-h-11 min-w-11 rounded-lg text-2xl">×</button></div>
        <div className={styles.drawerBody}><Links pathname={pathname} onNavigate={close} /></div>
      </div>
    </dialog>
  </>;
}
