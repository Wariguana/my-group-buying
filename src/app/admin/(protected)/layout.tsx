import Link from "next/link";
import { linkStyles } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logoutAdmin } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminHeader } from "@/components/admin/admin-header";
import styles from "@/components/admin/admin.module.css";
import { LogoutButton } from "./logout-button";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div lang="zh-Hant" className={styles.shell}>
      <a href="#main-content" className={linkStyles.skip}>跳至主要內容</a>
      <aside className={styles.sidebar} aria-label="營運功能">
        <Link href="/admin" className={`${linkStyles.brand} ${styles.sidebarBrand}`} aria-label="QBUY 營運後台總覽">
          <span>QBUY <small>ADM</small></span><span>快易購營運管理</span>
        </Link>
        <AdminNav mode="desktop" />
      </aside>
      <div className={styles.workspace}>
        <AdminHeader email={admin.email} accountAction={<form action={logoutAdmin}><LogoutButton /></form>} />
        <main id="main-content" tabIndex={-1} className={`${styles.main} mx-auto w-full min-w-0 max-w-[90rem] px-4 py-5 sm:px-6 sm:py-9 lg:px-10 lg:py-10`}>{children}</main>
      </div>
      <AdminNav mode="mobile" />
    </div>
  );
}
