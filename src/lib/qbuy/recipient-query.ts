import { z } from "zod";

export const recipientPageSize = 50;
const pageInput = z.string().regex(/^[1-9]\d{0,3}$/).transform(Number);
export function parseRecipientPage(value: unknown): number {
  const result = pageInput.safeParse(value);
  return result.success ? result.data : 1;
}
