import "server-only";

export const ORDER_ACCESS_COOKIE_NAME = "order_access";

export function orderAccessCookieOptions(publicCode: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: `/orders/${publicCode}`,
  };
}
