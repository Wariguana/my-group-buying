import type { ReactNode } from "react";
import type { PublicGroupBuyLifecycle } from "@/lib/group-buys/public";
import { formatTaipeiDisplayDateTime } from "@/lib/group-buys/time";
import { StatusBadge } from "@/components/consumer/ui/status-badge";
import { StorefrontHeader } from "@/app/storefront-header";
import type { StorefrontQuery } from "@/app/storefront-search";
import { ConsumerFooter } from "@/components/help/consumer-footer";

const lifecyclePresentation: Record<
  PublicGroupBuyLifecycle,
  { label: string; tone: "blue" | "green" | "slate"; message: string }
> = {
  scheduled: {
    label: "尚未開始",
    tone: "blue",
    message: "目前尚未開放訂購。",
  },
  active: {
    label: "開放訂購中",
    tone: "green",
    message: "目前開放訂購。",
  },
  ended: {
    label: "已截止",
    tone: "slate",
    message: "團購已結束。",
  },
};

export function LifecycleBadge({ lifecycle }: { lifecycle: PublicGroupBuyLifecycle }) {
  const presentation = lifecyclePresentation[lifecycle];
  return (
    <StatusBadge tone={presentation.tone}>
      {presentation.label}
    </StatusBadge>
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

type HeaderCustomerAccount = Readonly<{ displayName: string | null; pictureUrl?: string | null }>;

export function PublicHeader({ customerAccount }: { customerAccount: HeaderCustomerAccount | null }) {
  return <StorefrontHeader account={customerAccount ? { displayName: customerAccount.displayName, pictureUrl: customerAccount.pictureUrl } : null} />;
}

export function CustomerPageShell({
  children,
  customerAccount,
  width = "max-w-6xl",
  compact = false,
  storefrontQuery,
}: Readonly<{
  children: ReactNode;
  customerAccount: HeaderCustomerAccount | null;
  width?: string;
  compact?: boolean;
  storefrontQuery?: StorefrontQuery;
}>) {
  return (
    <div className="qbuy-storefront qbuy-customer-page flex min-h-screen flex-col text-stone-950">
      {compact ? <StorefrontHeader query={storefrontQuery} account={customerAccount ? { displayName: customerAccount.displayName, pictureUrl: customerAccount.pictureUrl } : null} /> : <PublicHeader customerAccount={customerAccount} />}
      <main id="main-content" tabIndex={-1} className={`mx-auto w-full min-w-0 flex-1 px-3 ${width} sm:px-8 ${compact ? "py-5 sm:py-7" : "py-6 sm:py-8"}`}>{children}</main>
      <ConsumerFooter />
    </div>
  );
}
