"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useOptimistic, useRef, useTransition, type ReactNode } from "react";
import { buttonStyles } from "@/components/consumer/ui/primitives";
import type { StorefrontQuery } from "@/app/storefront-search";

function reveal(container: HTMLElement | null, link: HTMLElement) {
  if (!container || container.scrollWidth <= container.clientWidth) return;
  const bounds = container.getBoundingClientRect(), chip = link.getBoundingClientRect();
  const delta = chip.left < bounds.left + 6 ? chip.left - bounds.left - 6 : chip.right > bounds.right - 6 ? chip.right - bounds.right + 6 : 0;
  if (delta) container.scrollBy({ left: delta, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}

export function StorefrontBrowser({ query, categories, children }: { query: StorefrontQuery; categories: { id: string; name: string }[]; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, select] = useOptimistic(query.category ?? "");
  const nav = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const activeName = categories.find(category => category.id === selected)?.name ?? "全部";
  useLayoutEffect(() => {
    const row = track.current, marker = indicator.current;
    if (!row || !marker) return;
    const position = () => {
      const active = row.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!active) { delete marker.dataset.ready; return; }
      // Content-relative coordinates stay aligned while only the chip row scrolls.
      marker.style.transform = `translate3d(${active.offsetLeft + active.offsetWidth / 2 - 12}px, 0, 0)`;
      marker.dataset.ready = "true";
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(row);
    row.querySelectorAll("a").forEach(link => observer.observe(link));
    return () => observer.disconnect();
  }, [selected, categories]);
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (active) reveal(nav.current, active);
  }, [query.category]);
  const href = (category: string) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, category })) if (value) params.set(key, value);
    return params.size ? `/?${params}` : "/";
  };
  return <div>
    <div className="relative mt-4">
      <nav ref={nav} aria-label="商品分類" className="qbuy-category-nav max-w-full overflow-x-auto overscroll-x-contain">
        <div ref={track} className="qbuy-category-track">
        {[{ id: "", name: "全部" }, ...categories].map(category => <Link key={category.id} href={href(category.id)} scroll={false} className={buttonStyles.category} aria-current={selected === category.id ? "page" : undefined} onNavigate={event => {
          event.preventDefault();
          const link = [...nav.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []].find(link => link.getAttribute("href") === href(category.id));
          if (link) reveal(nav.current, link);
          if (selected === category.id) return;
          startTransition(() => {
            select(category.id);
            router.push(href(category.id), { scroll: false });
          });
        }}>{category.name}</Link>)}
          <span ref={indicator} aria-hidden="true" className="qbuy-category-marker" />
        </div>
      </nav>
      <p role="status" aria-live="polite" className="qbuy-category-status">{pending ? `正在切換至「${activeName}」，商品更新中…` : ""}</p>
    </div>
    <div aria-busy={pending} className="qbuy-category-results" data-pending={pending || undefined}>
      <div inert={pending} className="qbuy-category-content">{children}</div>
    </div>
  </div>;
}
