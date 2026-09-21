import "server-only";

import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE_NAME } from "@/lib/customer-auth/cookie";
import { getCustomerAccountBySessionToken } from "@/lib/customer-auth/session";

/** Every call rechecks the hashed, expiring DB-backed customer session. */
export async function getCurrentCustomerAccount() {
  const cookieStore = await cookies();
  return getCustomerAccountBySessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE_NAME)?.value);
}
