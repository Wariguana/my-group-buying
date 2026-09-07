import "server-only";

import { getDb } from "@/lib/db";
import type { PublicAdmin } from "@/lib/auth/credentials";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";

export const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function isValidSessionToken(token: unknown): token is string {
  return typeof token === "string" && token.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Trusted server-side userId only, obtained from credential authentication. */
export async function createAdminSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
  try {
    await getDb().session.create({
      data: { userId, tokenHash: hashSessionToken(token), expiresAt },
      select: { id: true },
    });
    return { token, expiresAt };
  } catch {
    throw new Error("Admin session creation failed.");
  }
}

export async function getAdminBySessionToken(rawToken: unknown): Promise<PublicAdmin | null> {
  if (!isValidSessionToken(rawToken)) return null;
  try {
    const session = await getDb().session.findUnique({
      where: { tokenHash: hashSessionToken(rawToken) },
      select: {
        expiresAt: true,
        user: { select: { id: true, email: true, isActive: true } },
      },
    });
    if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) return null;
    const { id, email, isActive } = session.user;
    return { id, email, isActive };
  } catch {
    throw new Error("Admin session lookup failed.");
  }
}

export async function revokeAdminSession(rawToken: unknown): Promise<void> {
  if (!isValidSessionToken(rawToken)) return;
  try {
    await getDb().session.deleteMany({ where: { tokenHash: hashSessionToken(rawToken) } });
  } catch {
    throw new Error("Admin session revocation failed.");
  }
}
