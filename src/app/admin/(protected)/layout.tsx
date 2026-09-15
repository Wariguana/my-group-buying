import { requireAdmin } from "@/lib/auth/current-admin";
import { logoutAdmin } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "./logout-button";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div lang="zh-Hant" className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-slate-950 text-white lg:fixed lg:inset-y-0 lg:w-60">
        <div className="flex items-center justify-between gap-4 px-5 py-4 lg:block lg:px-6 lg:py-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Good Neighbor</p>
            <p className="mt-1 text-lg font-bold">好鄰團購管理</p>
          </div>
          <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300 lg:mt-3 lg:inline-flex">Beta</span>
        </div>
        <AdminNav />
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex min-h-16 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">目前登入帳號</p>
              <p className="truncate text-sm font-semibold text-slate-800">{admin.email}</p>
            </div>
            <form action={logoutAdmin}><LogoutButton /></form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[90rem] px-4 py-7 sm:px-6 sm:py-9 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
