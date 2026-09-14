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

export function CoverImage({ url, title }: { url: string | null; title: string }) {
  if (!url) {
    return (
      <div aria-hidden="true" className="flex aspect-[16/9] w-full items-center justify-center bg-amber-50 text-3xl font-bold text-amber-900/25">
        好鄰
      </div>
    );
  }
  return (
    <div
      aria-label={`${title}封面`}
      role="img"
      className="aspect-[16/9] w-full bg-zinc-100 bg-cover bg-center"
      style={{ backgroundImage: `url(${JSON.stringify(url)})` }}
    />
  );
}

export function PublicHeader() {
  return (
    <header className="border-b border-amber-900/10 bg-amber-50/90">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center px-5 sm:px-8">
        <Link href="/" className="rounded-md text-lg font-bold tracking-tight text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden="true" />好鄰團購
        </Link>
      </div>
    </header>
  );
}

export function CustomerPageShell({ children, width = "max-w-6xl" }: Readonly<{ children: ReactNode; width?: string }>) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <PublicHeader />
      <main className={`mx-auto w-full ${width} px-5 py-9 sm:px-8 sm:py-14`}>{children}</main>
    </div>
  );
}
