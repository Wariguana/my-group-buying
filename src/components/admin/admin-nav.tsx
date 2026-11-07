"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { linkStyles } from "@/components/ui/primitives";
import { AdminIcon } from "./admin-icon";
import { adminNavigation, getAdminDestination, getMobileDestination, mobileNavigation } from "./navigation";
import styles from "./admin.module.css";

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); };
}

export function useAdminDestination() {
  const pathname = usePathname();
  const query = useSearchParams();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  return getAdminDestination(pathname, query, hash);
}

export function NavigationFeedback() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" className={styles.navigationFeedback}><span className="sr-only">載入中…</span></span> : null;
}

export function AdminNav({ mode }: { mode: "mobile" | "desktop" }) {
  const destination = useAdminDestination();
  if (mode === "mobile") return <nav aria-label="手機快速導覽" className={styles.mobileBar}>
    {mobileNavigation.map(link => <Link key={link.id} href={link.href} className={linkStyles.adminNav}
      aria-current={getMobileDestination(destination) === link.id ? "page" : undefined}>
      <span className={styles.mobileIcon}><AdminIcon name={link.icon} /></span><span>{link.label}</span><NavigationFeedback />
    </Link>)}
  </nav>;

  return <nav aria-label="管理後台導覽" className={styles.desktopNavigation}>
    {adminNavigation.map(group => <section key={group.title}>
      <h2 className={styles.navGroupTitle}>{group.title}</h2>
      <ul>{group.links.map(link => <li key={link.id}>
        <Link href={link.href} className={`${linkStyles.adminNav} ${styles.navLink}`} aria-current={destination === link.id ? "page" : undefined}>
          <AdminIcon name={link.icon} /><span>{link.label}</span><NavigationFeedback />
        </Link>
      </li>)}</ul>
    </section>)}
  </nav>;
}
