"use client";

import { useId, useState, type ReactNode } from "react";
import { disclosureStyles } from "@/components/consumer/ui/primitives";
import styles from "./help-center.module.css";

export function FooterAccordion({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const triggerId = `footer-trigger-${id}`, panelId = `footer-panel-${id}`;

  return <section className={styles.footerAccordion} data-expanded={expanded}>
    <h2><button id={triggerId} type="button" aria-expanded={expanded} aria-controls={panelId}
      className={`${disclosureStyles} ${styles.footerTrigger}`} onClick={() => setExpanded(current => !current)}>
      {title}<span aria-hidden="true" className={styles.footerToggle} />
    </button></h2>
    <div id={panelId} role="region" aria-labelledby={triggerId} aria-hidden={!expanded} inert={!expanded} className={styles.footerPanel}>
      <div className={styles.footerPanelClip}><div className={styles.footerPanelContent}>{children}</div></div>
    </div>
  </section>;
}
