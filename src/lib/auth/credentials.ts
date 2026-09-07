import "server-only";

import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { adminLoginInputSchema } from "@/lib/auth/validation";

export type PublicAdmin = { id: string; email: string; isActive: boolean };

/** Null is the single credential-failure contract, including invalid input. */
export async function authenticateAdminCredentials(input: unknown): Promise<PublicAdmin | null> {
  const parsed = adminLoginInputSchema.safeParse(input);
  if (!parsed.success) return null;

  try {
    const user = await getDb().user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, email: true, isActive: true, passwordHash: true },
    });
    if (!user || !user.isActive) {
      // One Argon2 operation on valid missing/inactive attempts, without storage.
      await hashPassword(parsed.data.password);
      return null;
    }
    if (!await verifyPassword(parsed.data.password, user.passwordHash)) return null;
    return { id: user.id, email: user.email, isActive: user.isActive };
  } catch {
    // Never propagate ORM arguments, hashes or driver metadata to callers/logs.
    throw new Error("Admin authentication failed.");
  }
}
