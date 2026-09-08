import { z } from "zod";

export const publicGroupBuySlugSchema = z
  .string()
  .regex(/^gb-[A-Za-z0-9_-]{16}$/);

export type PublicGroupBuyLifecycle = "scheduled" | "active" | "ended";

export function getPublicGroupBuyLifecycle(
  startAt: Date,
  endAt: Date,
  now: Date,
): PublicGroupBuyLifecycle {
  if (now < startAt) return "scheduled";
  if (now < endAt) return "active";
  return "ended";
}
