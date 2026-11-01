"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buttonStyles, fieldStyles } from "@/components/consumer/ui/primitives";
import { Icon } from "@/components/ui/icons";

export type StorefrontQuery = { q?: string; category?: string; view?: string };

// Both layouts submit the original GET parameters to the same server-rendered page.
export function StorefrontSearchForm({ query, onSubmit, autoFocus = false }: { query: StorefrontQuery; onSubmit?: () => void; autoFocus?: boolean }) {
  const [value, setValue] = useState(query.q ?? "");
  const input = useRef<HTMLInputElement>(null);
  return <form role="search" className="flex items-center gap-2 sm:gap-3" action="/" onSubmit={onSubmit}>
    <input type="hidden" name="category" value={query.category ?? ""} />
    <input type="hidden" name="view" value={query.view ?? ""} />
    <div className="relative min-w-0 flex-1">
      <label><span className="sr-only">搜尋商品</span><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-500"><Icon name="search" /></span>
        <input ref={input} autoFocus={autoFocus} className={`${fieldStyles} qbuy-search-field`} name="q" type="text" inputMode="search" enterKeyHint="search" maxLength={120} value={value} onChange={event => setValue(event.target.value)} placeholder="搜尋商品、品牌或關鍵字" autoComplete="off" />
      </label>
      {value && <button type="button" aria-label="清除輸入" className={`${buttonStyles.header} qbuy-search-clear`} onClick={() => { setValue(""); input.current?.focus(); }}><span aria-hidden="true">×</span></button>}
    </div>
    <button type="submit" className={buttonStyles.storefrontPrimary}>搜尋</button>
  </form>;
}

export function StorefrontMobileSearch({ query }: { query: StorefrontQuery }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 640px)");
    const closeOnDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [open]);
  return <div className="sm:hidden">
    <button ref={trigger} type="button" aria-label="搜尋團購" aria-haspopup="dialog" aria-expanded={open} className={buttonStyles.header} onClick={() => {
      dialog.current?.showModal();
      setOpen(true);
    }}><Icon name="search" /></button>
    <dialog ref={dialog} aria-labelledby={titleId} className="qbuy-search-dialog" onClose={() => { setOpen(false); trigger.current?.focus(); }} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="hidden"]):not(:disabled)');
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-bold">搜尋團購</h2><button type="button" className={buttonStyles.header} onClick={() => dialog.current?.close()}>關閉</button></div>
      {open && <StorefrontSearchForm query={query} autoFocus onSubmit={() => dialog.current?.close()} />}
      <p className="mt-3 text-sm leading-6 text-stone-500">搜尋商品、品牌或關鍵字，保留目前的分類條件。</p>
    </dialog>
  </div>;
}
