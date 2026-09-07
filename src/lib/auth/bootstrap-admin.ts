import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { firstAdminInputSchema } from "@/lib/auth/validation";

type BootstrapErrorCode = "INVALID_INPUT" | "USER_EXISTS" | "CONFLICT" | "FAILED";

const errorMessages: Record<BootstrapErrorCode, string> = {
  INVALID_INPUT: "Invalid first admin input.",
  USER_EXISTS: "First admin bootstrap is unavailable because a user already exists.",
  CONFLICT: "First admin bootstrap conflicted with another transaction. Retry the operation.",
  FAILED: "First admin bootstrap failed.",
};

export class AdminBootstrapError extends Error {
  constructor(public readonly code: BootstrapErrorCode) {
    super(errorMessages[code]);
    this.name = "AdminBootstrapError";
  }
}

function isTransactionConflictError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return true;
  }
  if (typeof error !== "object" || error === null || !("cause" in error)) {
    return false;
  }

  const cause = error.cause;
  if (typeof cause !== "object" || cause === null) return false;

  return (
    "kind" in cause &&
    cause.kind === "TransactionWriteConflict" &&
    "originalCode" in cause &&
    (cause.originalCode === "40001" || cause.originalCode === "40P01")
  );
}

/** Trusted server-side entry point only; no execution or HTTP interface. */
export async function createFirstAdmin(input: unknown): Promise<{
  id: string;
  email: string;
  isActive: boolean;
}> {
  const parsed = firstAdminInputSchema.safeParse(input);
  if (!parsed.success) throw new AdminBootstrapError("INVALID_INPUT");

  try {
    // Keep expensive Argon2 work outside the database transaction.
    const passwordHash = await hashPassword(parsed.data.password);

    // PostgreSQL Serializable detects concurrent empty-table reads followed by
    // inserts, including different emails. At most one bootstrap can commit.
    // This protects this service, not arbitrary User writes elsewhere.
    return await getDb().$transaction(async (tx) => {
      const existing = await tx.user.findFirst({ select: { id: true } });
      if (existing) throw new AdminBootstrapError("USER_EXISTS");

      const user = await tx.user.create({
        data: { email: parsed.data.email, passwordHash, isActive: true },
        select: { id: true, email: true, isActive: true },
      });
      return { id: user.id, email: user.email, isActive: user.isActive };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof AdminBootstrapError) throw error;
    if (isTransactionConflictError(error)) {
      // Fail closed; a later explicit retry rechecks the entire transaction.
      throw new AdminBootstrapError("CONFLICT");
    }
    // ORM errors can contain query arguments. Do not expose them or their cause.
    throw new AdminBootstrapError("FAILED");
  }
}
