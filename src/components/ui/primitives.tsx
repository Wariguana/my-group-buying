import type { ReactNode } from "react";

export const buttonStyles = {
  primary: "inline-flex min-h-10 items-center justify-center rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-wait disabled:opacity-55",
  secondary: "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:opacity-50",
  danger: "inline-flex min-h-10 items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-50",
} as const;

export const fieldStyles = "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-600 focus:ring-3 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

export function PageHeader({ eyebrow, title, description, actions }: Readonly<{ eyebrow?: string; title: string; description?: string; actions?: ReactNode }>) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function Section({ title, description, actions, children, className = "" }: Readonly<{ title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }>) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, action }: Readonly<{ title: string; description?: string; action?: ReactNode }>) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ children }: Readonly<{ children: ReactNode }>) {
  return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{children}</p>;
}

export function DetailList({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return <dl className={`grid gap-x-8 gap-y-5 sm:grid-cols-2 ${className}`}>{children}</dl>;
}

export function Detail({ label, children, prominent = false }: Readonly<{ label: string; children: ReactNode; prominent?: boolean }>) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className={`mt-1 break-words ${prominent ? "text-xl font-bold text-slate-950" : "font-medium text-slate-800"}`}>{children}</dd></div>;
}
