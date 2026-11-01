import Link from "next/link";
import type { ReactNode } from "react";
import { checkoutLabels } from "@/lib/checkout/queries";
import { labels } from "@/lib/qbuy/domain";
import { Card, buttonStyles } from "@/components/ui/primitives";

const currency = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
const time = (date: Date) => date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

export type PurchaseSummary = {
  customerName: string;
  customerPhone: string;
  status: string;
  createdAt: Date;
  totalAmount: number;
  orderCount: number;
  groupCount: number;
};

export function PurchaseCard({ data, children }: { data: PurchaseSummary; children: ReactNode }) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-950">{data.customerName}</h2>
          <p className="mt-1 break-words text-sm text-slate-600">{time(data.createdAt)} · {data.customerPhone}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-800">{checkoutLabels[data.status] ?? "狀態待查核"}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-semibold text-slate-500">本次購買應收總額</p>
          <p className="mt-1 text-xl font-bold">{currency.format(data.totalAmount)}</p>
        </div>
        <p className="text-sm text-slate-600">正式訂單 {data.orderCount} 筆 · 配送群組 {data.groupCount} 個</p>
      </div>
      <details className="group mt-3">
        <summary className="cursor-pointer rounded-lg px-2 py-3 font-semibold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400">查看商品、付款、取消與配送詳情</summary>
        <div className="mt-3 space-y-4 border-t border-slate-100 pt-4">{children}</div>
      </details>
    </Card>
  );
}

export type FormalOrderSummary = {
  orderNumber: string;
  groupTitle: string;
  customerName: string;
  createdAt: Date;
  totalAmount: number;
  status: string;
  detailHref?: string;
};

export function FormalOrderCard({ data, children }: { data: FormalOrderSummary; children?: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono font-bold text-slate-950">{data.orderNumber}</p>
          <p className="mt-1 break-words font-semibold text-slate-900">{data.groupTitle}</p>
          <p className="mt-1 text-sm text-slate-600">{data.customerName} · {time(data.createdAt)}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-800">{labels[data.status] ?? "狀態待確認"}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-lg font-bold text-slate-950">{currency.format(data.totalAmount)}</p>
        {data.detailHref ? <Link href={data.detailHref} className={buttonStyles.secondary}>查看完整購買與履約資訊</Link> : children}
      </div>
    </Card>
  );
}
