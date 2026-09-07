"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateAdminCredentials } from "@/lib/auth/credentials";
import { createAdminSession, revokeAdminSession } from "@/lib/auth/session";
import { ADMIN_SESSION_COOKIE_NAME, adminSessionCookieOptions } from "@/lib/auth/cookie";

export type LoginState = { error: string | null };

// TODO: durable rate limiting required before public exposure.
// Mutations use Next Server Actions' POST / Origin-vs-Host protections.
export async function loginAdmin(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  let session: Awaited<ReturnType<typeof createAdminSession>> | undefined;
  try {
    // React adds $ACTION_ transport fields for progressive enhancement.
    // Reject every other extra field and duplicate credential fields.
    const entries = [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"));
    const input = new Set(entries.map(([key]) => key)).size === entries.length
      ? Object.fromEntries(entries)
      : null;
    const admin = await authenticateAdminCredentials(input);
    if (!admin) return { error: "Email 或密碼錯誤" };

    session = await createAdminSession(admin.id);
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, session.token, adminSessionCookieOptions(session.expiresAt));
  } catch {
    if (session) {
      // Cookie failure: best-effort removal of the newly created session only.
      try { await revokeAdminSession(session.token); } catch { /* No secret-bearing logs. */ }
    }
    return { error: "登入失敗，請稍後再試。" };
  }
  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  const cookieStore = await cookies();
  try {
    await revokeAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  } catch {
    // A failed DB revoke must not prevent the browser from discarding its cookie.
  } finally {
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, "", {
      ...adminSessionCookieOptions(new Date(0)),
      maxAge: 0,
    });
  }
  redirect("/admin/login");
}
