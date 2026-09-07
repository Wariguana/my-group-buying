import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { LoginForm } from "./login-form";

export default async function AdminLoginPage() {
  if (await getCurrentAdmin()) redirect("/admin");
  return (
    <main lang="zh-Hant" className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="w-full max-w-sm rounded-lg border border-zinc-300 p-6 dark:border-zinc-700">
        <h1 className="text-2xl font-semibold">管理員登入</h1>
        <LoginForm />
      </section>
    </main>
  );
}
