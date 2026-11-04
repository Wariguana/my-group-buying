import { linkStyles } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logoutAdmin } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import styles from "@/components/admin/admin.module.css";
import { LogoutButton } from "./logout-button";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div lang="zh-Hant" className={`${styles.shell} lg:grid lg:grid-cols-[15rem_1fr]`}>
      <a href="#main-content" className={linkStyles.skip}>跳至主要內容</a>
      <div className="lg:hidden">
        <AdminNav mode="mobile" email={admin.email} accountAction={<form action={logoutAdmin}><LogoutButton /></form>} />
      </div>
      <aside className={`${styles.sidebar} hidden lg:fixed lg:inset-y-0 lg:block lg:w-60 lg:overflow-y-auto`}>
        <div className="px-6 py-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">QBUY</p>
            <p className="mt-1 text-lg font-bold">快易購營運管理</p>
          </div>
        </div>
        <AdminNav mode="desktop" />
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="hidden border-b border-line bg-white lg:block">
          <div className="mx-auto flex min-h-16 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">目前登入帳號</p>
              <p className="truncate text-sm font-semibold text-slate-800">{admin.email}</p>
            </div>
            <form action={logoutAdmin}><LogoutButton /></form>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={`${styles.main} mx-auto w-full min-w-0 max-w-[90rem] px-4 py-5 sm:px-6 sm:py-9 lg:px-10 lg:py-10`}>{children}</main>
      </div>
    </div>
  );
}
