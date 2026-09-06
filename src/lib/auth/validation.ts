import "server-only";

import { z } from "zod";

export const adminEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

// Zod 4.5 measures Unicode code points; never transform the password value.
export const adminPasswordSchema = z.string().min(12).max(128);

// Reject extra fields, including caller-supplied passwordHash or isActive.
export const firstAdminInputSchema = z.strictObject({
  email: adminEmailSchema,
  password: adminPasswordSchema,
});
