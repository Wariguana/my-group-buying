"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { buttonStyles, disclosureStyles, linkStyles } from "@/components/consumer/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { CART_KEY, loadCart } from "@/lib/commerce/cart-storage";
import { StorefrontMobileSearch, type StorefrontQuery } from "@/app/storefront-search";

function subscribeCart(update: () => void) {
  const changed = (event: StorageEvent) => { if (!event.key || event.key === CART_KEY) update(); };
  window.addEventListener("storage", changed);
  window.addEventListener("focus", update);
  window.addEventListener("pageshow", update);
  return () => {
    window.removeEventListener("storage", changed);
    window.removeEventListener("focus", update);
    window.removeEventListener("pageshow", update);
  };
}

function cartCount() {
  try { return loadCart(localStorage).reduce((total, line) => total + line.quantity, 0); }
  catch { return null; }
}

export function StorefrontHeader({ account, query = {} }: { account: { displayName: string | null; pictureUrl?: string | null } | null; query?: StorefrontQuery }) {
  const count = useSyncExternalStore(subscribeCart, cartCount, () => null);
  const menu = useRef<HTMLDetailsElement>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const name = account?.displayName?.trim() || "帳號";
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && menu.current?.open && !menu.current.contains(event.target)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return <header className="qbuy-storefront-header">
    <a href="#main-content" className={linkStyles.skip}>跳至主要內容</a>
    <div className="mx-auto flex min-h-[68px] max-w-6xl items-center justify-between gap-2 px-3 sm:px-8">
      <Link href="/" className={`${linkStyles.brand} qbuy-storefront-brand`} aria-label="QBUY 快易購"><span className="qbuy-brand-dot" aria-hidden="true" /><span>QBUY<span className="qbuy-brand-name"> 快易購</span></span></Link>
      <nav aria-label="顧客導航" className="flex shrink-0 items-center gap-1 sm:gap-2">
        <StorefrontMobileSearch key={JSON.stringify(query)} query={query} />
        {account && <Link href="/my/orders" aria-label="我的訂單" title="我的訂單" className={buttonStyles.header}><Icon name="orders" /><span className="hidden md:inline">我的訂單</span></Link>}
        <Link href="/cart" aria-label="購物車" title={count ? `購物車：${count} 件商品` : "購物車"} className={`${buttonStyles.header} relative`}>
          <Icon name="cart" /><span className="hidden md:inline">購物車</span>
          {count !== null && count > 0 && <span className="qbuy-cart-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
        </Link>
        {account ? <details ref={menu} className="relative" onKeyDown={event => {
          if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); }
        }}>
          <summary className={`${disclosureStyles} qbuy-header-account`} aria-label={`${name}，帳號選單`} title={name}>
            <span className="qbuy-avatar" aria-hidden="true">
              {account.pictureUrl && !avatarFailed ? (
                // Existing LINE profile metadata; a failed avatar falls back to an initial.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.pictureUrl} alt="" width={32} height={32} onError={() => setAvatarFailed(true)} />
              ) : account.displayName?.trim() ? [...name][0].toUpperCase() : <Icon name="user" className="h-4 w-4" />}
            </span>
            <span className="hidden max-w-32 truncate md:inline">{name}</span><Icon name="chevron" className="hidden h-4 w-4 md:block" />
          </summary>
          <div className="qbuy-account-menu">
            <p className="text-xs text-stone-500">目前登入帳號</p><p className="mt-1 break-words text-sm font-semibold text-stone-800">{name}</p>
            <form action="/api/auth/line/logout" method="post" className="mt-3 border-t border-stone-100 pt-3"><button type="submit" className={`${buttonStyles.header} w-full`}>登出</button></form>
          </div>
        </details> : <a href="/api/auth/line/start" aria-label="LINE 登入" title="LINE 登入" className={buttonStyles.header}><Icon name="user" /><span className="hidden md:inline">LINE 登入</span></a>}
      </nav>
    </div>
  </header>;
}
