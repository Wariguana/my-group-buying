import { requireAdmin } from "@/lib/auth/current-admin";
import { logoutAdmin } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "@/components/admin/admin.module.css";
import { LogoutButton } from "./logout-button";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div lang="zh-Hant" className={`${styles.shell} lg:grid lg:grid-cols-[15rem_1fr]`}>
      <a href="#adm-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:p-3 focus:text-slate-950">跳至主要內容</a>
      <aside className={`${styles.sidebar} lg:fixed lg:inset-y-0 lg:w-60 lg:overflow-y-auto`}>
        <div className="flex items-center justify-between gap-4 px-4 py-3 lg:block lg:px-6 lg:py-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">QBUY</p>
            <p className="mt-1 text-lg font-bold">快易購管理後台</p>
          </div>
          <div className="lg:hidden"><AdminNav mode="mobile" /></div>
        </div>
        <div className="hidden lg:block"><AdminNav mode="desktop" /></div>
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex min-h-14 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
            <p className="min-w-0 truncate text-xs text-slate-600 sm:text-sm">管理員：<span className="font-semibold text-slate-800">{admin.email}</span></p>
            <form action={logoutAdmin}><LogoutButton /></form>
          </div>
        </header>
        <main id="adm-main" tabIndex={-1} className="mx-auto w-full max-w-[90rem] min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
