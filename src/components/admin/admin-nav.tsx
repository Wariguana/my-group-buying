"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonStyles, linkStyles } from "@/components/ui/primitives";
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
      return <li key={link.href}><Link className={`${linkStyles.adminNav} ${styles.navLink}`} href={link.href} aria-current={active ? "page" : undefined} onNavigate={onNavigate}>{link.label}</Link></li>;
    })}</ul>
  </section>)}</nav>;
}
const mobileLinks = [
  { href: "/admin", label: "總覽", icon: "m3 11 9-8 9 8M5 10v11h5v-6h4v6h5V10" },
  { href: "/admin/qbuy", label: "訂單", icon: "M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h4" },
  { href: "/admin/products", label: "商品", icon: "m12 3 9 5v8l-9 5-9-5V8zm0 10 9-5m-9 5L3 8m9 5v8" },
] as const;

function NavIcon({ path }: { path: string }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

export function AdminNav({ mode, email, accountAction }: {
  mode: "mobile" | "desktop";
  email?: string;
  accountAction?: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<"navigation" | "account" | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  function show(panel: "navigation" | "account", trigger: HTMLButtonElement) {
    opener.current = trigger;
    setOpen(panel);
  }

  function close(navigating = false) {
    dialog.current?.close();
    setOpen(null);
    if (navigating) document.getElementById("main-content")?.focus({ preventScroll: true });
    else opener.current?.focus();
  }

  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    const media = window.matchMedia("(min-width:1024px)");
    const resized = () => {
      if (media.matches) close(true);
    };
    media.addEventListener("change", resized);
    return () => {
      node.close();
      document.body.style.overflow = previous;
      media.removeEventListener("change", resized);
    };
  }, [open]);

  if (mode === "desktop") return <Links pathname={pathname} />;
  return <>
    <header className={styles.mobileHeader}>
      <Link className={`${linkStyles.brand} ${styles.mobileBrand}`} href="/admin">QBUY <span>營運後台</span></Link>
      <button type="button" className={`${buttonStyles.textAction} ${styles.menuButton}`} aria-expanded={open === "account"} aria-controls="adm-mobile-dialog"
        onClick={event => show("account", event.currentTarget)}>
        <NavIcon path="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2" />帳號
      </button>
    </header>
    <nav aria-label="手機快速導覽" className={styles.mobileBar}>
      {mobileLinks.map(({ href, label, icon }) => {
        const active = pathname === href || (href !== "/admin" && pathname.startsWith(href + "/"));
        return <Link key={href} href={href} className={linkStyles.adminNav} aria-current={active ? "page" : undefined}><NavIcon path={icon} />{label}</Link>;
      })}
      <button type="button" className={buttonStyles.textAction} aria-label="開啟管理選單" aria-expanded={open === "navigation"} aria-controls="adm-mobile-dialog"
        onClick={event => show("navigation", event.currentTarget)}>
        <NavIcon path="M4 6h16M4 12h16M4 18h16" />更多
      </button>
    </nav>
    <dialog ref={dialog} id="adm-mobile-dialog" aria-label={open === "account" ? "帳號選單" : "管理選單"} className={styles.dialog}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]"));
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className={open === "account" ? styles.accountPanel : styles.drawer}>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <h2 className="font-bold">{open === "account" ? "管理帳號" : "管理選單"}</h2>
          <button type="button" onClick={() => close()} aria-label={open === "account" ? "關閉帳號選單" : "關閉管理選單"} className={buttonStyles.icon}>×</button>
        </div>
        {open === "account" ? (
          <div className="space-y-3 px-5 pb-5">
            <p className="break-all text-sm">{email}</p>
            {accountAction}
          </div>
        ) : <div className={styles.drawerBody}><Links pathname={pathname} onNavigate={() => close(true)} /></div>}
      </div>
    </dialog>
  </>;
}
