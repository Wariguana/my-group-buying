import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logoutAdmin } from "@/app/admin/actions";
import { LogoutButton } from "./logout-button";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div lang="zh-Hant" className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-300 pb-6 dark:border-zinc-700">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">管理後台</h1>
          <p className="mt-2 break-all text-sm text-zinc-600 dark:text-zinc-400">{admin.email}</p>
        </div>
        <form action={logoutAdmin}><LogoutButton /></form>
      </header>
      <nav aria-label="管理後台導覽" className="border-b border-zinc-200 py-3 dark:border-zinc-800">
        <Link href="/admin/suppliers" className="font-medium underline-offset-4 hover:underline">供應商管理</Link>
      </nav>
      <main className="py-8">{children}</main>
    </div>
  );
}
