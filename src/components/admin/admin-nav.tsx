"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const groups = [
  { title: "工作台", links: [{ href: "/admin", label: "工作總覽" }] },
  { title: "訂單與交易", links: [
    { href: "/admin/qbuy", label: "訂單管理" },
    { href: "/admin/payments", label: "付款確認與退款" },
  ] },
  { title: "商品與團購", links: [
    { href: "/admin/group-buys", label: "團購管理" },
    { href: "/admin/products", label: "商品管理" },
    { href: "/admin/commerce", label: "商品規格與庫存" },
    { href: "/admin/suppliers", label: "供應商管理" },
  ] },
  { title: "營運設定", links: [{ href: "/admin/pickup-locations", label: "取貨地點" }] },
  { title: "系統", links: [{ href: "/admin/operations", label: "系統狀態" }] },
] as const;

function Links({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="管理後台導覽" className="space-y-5 px-3 pb-6">
      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="px-3 text-xs font-semibold tracking-wider text-slate-400">{group.title}</h2>
          <ul className="mt-2 space-y-1">
            {group.links.map((link) => {
              const active = link.href === "/admin"
                ? pathname === "/admin"
                : pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <li key={link.href}>
                  <Link href={link.href} aria-current={active ? "page" : undefined} onClick={onNavigate}
                    className={`flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? "bg-white text-slate-950" : "text-slate-200 hover:bg-slate-800 hover:text-white"}`}>
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export function AdminNav({ mode }: { mode: "mobile" | "desktop" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "mobile" || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        opener.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [mode, open]);

  if (mode === "desktop") {
    return <Links pathname={pathname} />;
  }

  const close = () => { setOpen(false); opener.current?.focus(); };
  return (
    <>
      <button ref={opener} type="button" aria-label="開啟管理選單" aria-expanded={open}
        aria-controls="adm-mobile-navigation" onClick={() => setOpen(true)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-600 text-xl text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        <span aria-hidden="true">☰</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="關閉管理選單背景" onClick={close} tabIndex={-1}
            className="absolute inset-0 h-full w-full cursor-pointer bg-slate-950/70" />
          <div id="adm-mobile-navigation" role="dialog" aria-modal="true" aria-label="管理選單" ref={panel}
            className="absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col bg-slate-950 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div><p className="text-xs font-bold tracking-widest text-slate-400">QBUY</p><p className="mt-1 font-bold">管理選單</p></div>
              <button type="button" onClick={close} aria-label="關閉管理選單"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl focus-visible:outline-2 focus-visible:outline-white">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pt-5">
              <Links pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
