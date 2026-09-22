import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { LoginForm } from "./login-form";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ logout?: string | string[] }>;
}) {
  if (await getCurrentAdmin()) redirect("/admin");
  const logoutFailed = (await searchParams).logout === "failed";
  return (
    <main lang="zh-Hant" className="flex min-h-screen flex-1 items-center justify-center bg-slate-100 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/70 sm:p-9">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Good Neighbor</p>
          <p className="mt-1 text-lg font-bold text-slate-900">好鄰團購管理</p>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">管理員登入</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">登入後管理團購、訂單與取貨作業。</p>
        {logoutFailed && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
            登出失敗，請稍後再試。
          </p>
        )}
        <LoginForm />
      </section>
    </main>
  );
}
