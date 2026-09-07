import "server-only";

import { z } from "zod";

const optionalContactField = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  },
  z.string().nullable().optional(),
);

const editableSupplierFields = {
  name: z.string().trim().min(1, "請輸入供應商名稱。"),
  contactName: optionalContactField,
  phone: optionalContactField,
  lineContact: optionalContactField,
  note: optionalContactField,
};

export const createSupplierSchema = z.object(editableSupplierFields).strict();
export const updateSupplierSchema = z.object(editableSupplierFields).strict();
export const supplierIdSchema = z.uuid();
export const supplierStatusMutationSchema = z.object({
  id: supplierIdSchema,
  isActive: z.boolean(),
}).strict();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
