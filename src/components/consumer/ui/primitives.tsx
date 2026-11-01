import { cloneElement, isValidElement, type AriaAttributes, type ReactNode } from "react";

export const buttonStyles = {
  primary: "qbuy-button qbuy-button-primary",
  secondary: "qbuy-button qbuy-button-secondary",
  textAction: "qbuy-button qbuy-button-text",
  danger: "qbuy-button qbuy-button-danger",
  line: "qbuy-button qbuy-button-line",
  icon: "qbuy-button qbuy-button-secondary qbuy-button-icon",
  thumbnail: "qbuy-button qbuy-button-thumbnail",
  header: "qbuy-button qbuy-button-header",
  category: "qbuy-button qbuy-button-category",
  storefrontPrimary: "qbuy-button qbuy-button-storefront-primary",
  storefrontOutline: "qbuy-button qbuy-button-storefront-outline",
} as const;

export const fieldStyles = "qbuy-field";
export const labelStyles = "qbuy-label";
export const checkStyles = "qbuy-check";
export const choiceStyles = "qbuy-choice cursor-pointer";
export const disclosureStyles = "qbuy-disclosure";
export const linkStyles = {
  inline: "qbuy-link",
  card: "qbuy-card-link",
  row: "qbuy-row-link",
  brand: "qbuy-brand-link",
  skip: "qbuy-skip-link",
} as const;
export const messageStyles = {
  error: "qbuy-notice qbuy-notice-error",
  success: "qbuy-notice qbuy-notice-success",
  info: "qbuy-notice qbuy-notice-info",
  warning: "qbuy-notice qbuy-notice-warning",
} as const;
export const titleStyles = { page: "text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl", section: "text-xl font-bold text-stone-950 sm:text-2xl", card: "text-lg font-bold text-stone-950", label: "text-base font-semibold text-stone-800" } as const;
export const tableStyles = {
  actionHeader: "sticky right-0 z-10 bg-surface-muted px-5 py-3",
  actionCell: "sticky right-0 z-10 bg-white px-5 py-4 text-right shadow-[-1px_0_0_#e9e1d7]",
} as const;

export function FormField({ label, name, required = false, errors, children }: Readonly<{ label: string; name: string; required?: boolean; errors?: string[]; children: ReactNode }>) {
  const invalid = Boolean(errors?.length);
  const errorId = `${name}-error`;
  const control = isValidElement<AriaAttributes>(children) ? cloneElement(children, {
    "aria-invalid": invalid || undefined,
    "aria-describedby": [children.props["aria-describedby"], invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined,
  }) : children;
  return <div className="space-y-2"><label htmlFor={name} className={labelStyles}>{label}{required ? " *" : ""}</label>{control}{invalid && <div id={errorId} role="alert" className={messageStyles.error}>{errors!.map(error => <p key={error}>{error}</p>)}</div>}</div>;
}

export function PageHeader({ eyebrow, eyebrowColor = "text-stone-600", title, description, actions }: Readonly<{ eyebrow?: string; eyebrowColor?: string; title: string; description?: string; actions?: ReactNode }>) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className={`text-xs font-bold uppercase tracking-[0.16em] ${eyebrowColor}`}>{eyebrow}</p>}
        <h1 className={`mt-1 ${titleStyles.page}`}>{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={`qbuy-panel ${className}`}>{children}</div>;
}

export function Section({ title, description, actions, children, className = "" }: Readonly<{ title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }>) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={titleStyles.card}>{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, action }: Readonly<{ title: string; description?: string; action?: ReactNode }>) {
  return (
    <div className="qbuy-empty">
      <p className="font-semibold text-stone-800">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ children }: Readonly<{ children: ReactNode }>) {
  return <p role="alert" className={messageStyles.error}>{children}</p>;
}

export function DetailList({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return <dl className={`grid gap-x-8 gap-y-5 sm:grid-cols-2 ${className}`}>{children}</dl>;
}

export function Detail({ label, children, prominent = false }: Readonly<{ label: string; children: ReactNode; prominent?: boolean }>) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt><dd className={`mt-1 break-words ${prominent ? "text-xl font-bold text-stone-950" : "font-medium text-stone-800"}`}>{children}</dd></div>;
}
