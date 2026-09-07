import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { getAdminBySessionToken } from "@/lib/auth/session";

/** No auth-result cache: every call rechecks expiry and the current User state. */
export async function getCurrentAdmin() {
  const cookieStore = await cookies();
  return getAdminBySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

/**
 * Layouts only guard navigation/rendering and may be reused during navigation.
 * Every future protected mutation and sensitive data read must independently
 * call requireAdmin(); a layout check is never authorization for a Server Action.
 */
export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
