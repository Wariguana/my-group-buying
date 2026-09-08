import Link from "next/link";
import type { PublicGroupBuyLifecycle } from "@/lib/group-buys/public";
import { taipeiDisplayFormatter } from "@/lib/group-buys/time";

const lifecyclePresentation: Record<
  PublicGroupBuyLifecycle,
  { label: string; badgeClassName: string; message: string }
> = {
  scheduled: {
    label: "尚未開始",
    badgeClassName: "bg-sky-100 text-sky-800",
    message: "此團購尚未開始。",
  },
  active: {
    label: "開放訂購中",
    badgeClassName: "bg-emerald-100 text-emerald-800",
    message: "目前開放訂購，但線上下單功能尚未開放。",
  },
  ended: {
    label: "已截止",
    badgeClassName: "bg-zinc-200 text-zinc-700",
    message: "此團購已截止。",
  },
};

export function LifecycleBadge({ lifecycle }: { lifecycle: PublicGroupBuyLifecycle }) {
  const presentation = lifecyclePresentation[lifecycle];
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${presentation.badgeClassName}`}>
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
      訂購期間：{taipeiDisplayFormatter.format(startAt)}－{taipeiDisplayFormatter.format(endAt)}
    </p>
  );
}

export function CoverImage({ url, title }: { url: string; title: string }) {
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
    <header className="border-b border-amber-900/10 bg-amber-50/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="text-lg font-bold tracking-tight text-stone-900">
          好鄰團購
        </Link>
        <span className="text-sm text-stone-600">台灣時間</span>
      </div>
    </header>
  );
}
