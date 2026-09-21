import "server-only";

import { getDb } from "@/lib/db";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";
import type { VerifiedLineIdentity } from "@/lib/customer-auth/line";

export const CUSTOMER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type CurrentCustomerAccount = Readonly<{
  id: string;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
}>;

export function isValidCustomerSessionToken(token: unknown): token is string {
  return typeof token === "string" && token.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function createCustomerSession(
  identity: VerifiedLineIdentity,
): Promise<{ token: string; expiresAt: Date; account: CurrentCustomerAccount }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CUSTOMER_SESSION_TTL_SECONDS * 1000);
  try {
    const account = await getDb().$transaction(async (transaction) => {
      const upserted = await transaction.customerAccount.upsert({
        where: { lineUserId: identity.lineUserId },
        create: { ...identity, lastLoginAt: now },
        update: {
          displayName: identity.displayName,
          pictureUrl: identity.pictureUrl,
          lastLoginAt: now,
        },
        select: { id: true, lineUserId: true, displayName: true, pictureUrl: true },
      });
      await transaction.customerSession.create({
        data: { customerAccountId: upserted.id, tokenHash, expiresAt },
        select: { id: true },
      });
      return upserted;
    });
    return { token, expiresAt, account };
  } catch {
    throw new Error("Customer session creation failed.");
  }
}

export async function getCustomerAccountBySessionToken(rawToken: unknown): Promise<CurrentCustomerAccount | null> {
  if (!isValidCustomerSessionToken(rawToken)) return null;
  try {
    const session = await getDb().customerSession.findUnique({
      where: { tokenHash: hashSessionToken(rawToken) },
      select: {
        expiresAt: true,
        customerAccount: {
          select: { id: true, lineUserId: true, displayName: true, pictureUrl: true },
        },
      },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    return session.customerAccount;
  } catch {
    throw new Error("Customer session lookup failed.");
  }
}

export async function revokeCustomerSession(rawToken: unknown): Promise<void> {
  if (!isValidCustomerSessionToken(rawToken)) return;
  try {
    await getDb().customerSession.deleteMany({ where: { tokenHash: hashSessionToken(rawToken) } });
  } catch {
    throw new Error("Customer session revocation failed.");
  }
}
