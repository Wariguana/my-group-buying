import type { ReactNode } from "react";

type Tone = "blue" | "green" | "amber" | "slate" | "red";
const tones: Record<Tone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  slate: "border-slate-200 bg-slate-100 text-slate-700",
  red: "border-red-200 bg-red-50 text-red-800",
};

export function StatusBadge({ children, tone = "slate" }: Readonly<{ children: ReactNode; tone?: Tone }>) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold leading-none ${tones[tone]}`}>{children}</span>;
}

export function OrderStatusBadge({ status }: Readonly<{ status: "PLACED" | "CANCELLED" }>) {
  return <StatusBadge tone={status === "PLACED" ? "green" : "slate"}><span className="sr-only">{status}</span>{status === "PLACED" ? "訂單成立" : "已取消"}</StatusBadge>;
}

export function PaymentStatusBadge({ paidAt }: Readonly<{ paidAt: Date | null }>) {
  return <StatusBadge tone={paidAt ? "green" : "amber"}>{paidAt ? "已收款" : "尚未確認收款"}</StatusBadge>;
}

export function PickupStatusBadge({ pickedUpAt }: Readonly<{ pickedUpAt: Date | null }>) {
  return <StatusBadge tone={pickedUpAt ? "green" : "blue"}>{pickedUpAt ? "已取貨" : "待取貨"}</StatusBadge>;
}
