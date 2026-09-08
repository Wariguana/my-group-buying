import "server-only";

import { z } from "zod";

const optionalDescription = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  },
  z.string().nullable().optional(),
);

const editablePickupLocationFields = {
  name: z.string().trim().min(1, "請輸入地點名稱。"),
  address: z.string().trim().min(1, "請輸入地址。"),
  description: optionalDescription,
};

export const createPickupLocationSchema = z.object(editablePickupLocationFields).strict();
export const updatePickupLocationSchema = z.object(editablePickupLocationFields).strict();
export const pickupLocationIdSchema = z.uuid();
export const pickupLocationStatusMutationSchema = z.object({
  id: pickupLocationIdSchema,
  isActive: z.boolean(),
}).strict();

export type CreatePickupLocationInput = z.infer<typeof createPickupLocationSchema>;
export type UpdatePickupLocationInput = z.infer<typeof updatePickupLocationSchema>;
