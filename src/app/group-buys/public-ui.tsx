import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicGroupBuyLifecycle } from "@/lib/group-buys/public";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";

const lifecyclePresentation: Record<
  PublicGroupBuyLifecycle,
  { label: string; badgeClassName: string; message: string }
> = {
  scheduled: {
    label: "尚未開始",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-800",
    message: "目前尚未開放訂購。",
  },
  active: {
    label: "開放訂購中",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
    message: "目前開放訂購。",
  },
  ended: {
    label: "已截止",
    badgeClassName: "border-stone-200 bg-stone-100 text-stone-700",
    message: "團購已結束。",
  },
};

export function LifecycleBadge({ lifecycle }: { lifecycle: PublicGroupBuyLifecycle }) {
  const presentation = lifecyclePresentation[lifecycle];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${presentation.badgeClassName}`}>
      {presentation.label}
    </span>
  );
}

export function LifecycleMessage({ lifecycle }: { lifecycle: PublicGroupBuyLifecycle }) {
  return <p>{lifecyclePresentation[lifecycle].message}</p>;
}

export function OrderingPeriod({ startAt, endAt }: { startAt: Date; endAt: Date }) {
  return (
    <p>
      訂購期間：{formatTaipeiDisplayDateTime(startAt)}－{formatTaipeiDisplayDateTime(endAt)}
    </p>
  );
}

export function CoverImage({
  url,
  title,
  fit = "cover",
  className = "",
}: {
  url: string | null;
  title: string;
  fit?: "cover" | "contain";
  className?: string;
}) {
  const sizingClassName = fit === "contain" ? "bg-contain bg-no-repeat" : "bg-cover";
  if (!url) {
    return (
      <div aria-hidden="true" className={`flex aspect-[16/9] w-full items-center justify-center bg-amber-50 text-3xl font-bold text-amber-900/25 ${className}`}>
        QBUY
      </div>
    );
  }
  return (
    <div
      aria-label={`${title}封面`}
      role="img"
      className={`aspect-[16/9] w-full bg-stone-100 bg-center ${sizingClassName} ${className}`}
      style={{ backgroundImage: `url(${JSON.stringify(url)})` }}
    />
  );
}

type HeaderCustomerAccount = Readonly<{ displayName: string | null }>;

export function PublicHeader({ customerAccount }: { customerAccount: HeaderCustomerAccount | null }) {
  return (
    <header className="border-b border-amber-900/10 bg-amber-50/90">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:block focus:p-3">跳至主要內容</a>
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <Link href="/" className="shrink-0 rounded-md text-lg font-bold tracking-tight text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden="true" />QBUY 快易購
        </Link>
        <Link href="/cart" className="inline-flex min-h-11 items-center text-sm font-semibold">購物車</Link>
        {customerAccount ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {customerAccount.displayName ? (
              <span className="hidden max-w-40 truncate text-sm font-medium text-stone-700 sm:inline">
                {customerAccount.displayName}
              </span>
            ) : null}
            <Link
              href="/my/orders"
              className="whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
            >
              我的訂單
            </Link>
            <form action="/api/auth/line/logout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
              >
                登出
              </button>
            </form>
          </div>
        ) : (
          <a
            href="/api/auth/line/start"
            className="inline-flex min-h-11 items-center rounded-lg bg-[#087f3e] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#076c35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            LINE 登入
          </a>
        )}
      </div>
    </header>
  );
}

export function CustomerPageShell({
  children,
  customerAccount,
  width = "max-w-6xl",
}: Readonly<{
  children: ReactNode;
  customerAccount: HeaderCustomerAccount | null;
  width?: string;
}>) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <PublicHeader customerAccount={customerAccount} />
      <main id="main-content" tabIndex={-1} className={`mx-auto w-full min-w-0 ${width} px-5 py-9 sm:px-8 sm:py-14`}>{children}</main>
      <footer className="border-t border-stone-200 px-5 py-6 text-center text-sm text-stone-600">QBUY 快易購 · 金額以新臺幣計價，時間以臺灣時間顯示。</footer>
    </div>
  );
}
