"use client";

import { useId, useState, type ReactNode } from "react";
import { buttonStyles } from "@/components/ui/primitives";
import styles from "./admin.module.css";

export function OrderFilterPanel({ children, activeFilters }: { children: ReactNode; activeFilters: string[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return <div>
    <div className={styles.filterSummary}>
      {activeFilters.length > 0 && <p className="text-sm text-stone-700">{activeFilters.join(" · ")}</p>}
      <button type="button" className={buttonStyles.secondary} aria-controls={id} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "收起查詢條件" : "調整查詢條件"}
      </button>
    </div>
    <div id={id} className={open ? styles.filtersExpanded : styles.filtersCollapsed}>{children}</div>
  </div>;
}
