import "server-only";

import { getDb } from "@/lib/db";
import {
  createSupplierSchema,
  supplierIdSchema,
  supplierStatusMutationSchema,
  updateSupplierSchema,
} from "@/lib/suppliers/validation";

export type SupplierErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "FAILED";

export type SupplierResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SupplierErrorCode };

export const supplierListSelect = {
  id: true,
  name: true,
  contactName: true,
  phone: true,
  lineContact: true,
  isActive: true,
} as const;

export const supplierDetailSelect = {
  id: true,
  name: true,
  contactName: true,
  phone: true,
  lineContact: true,
  note: true,
  isActive: true,
} as const;

export async function listSuppliers(): Promise<SupplierResult<Array<{
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  lineContact: string | null;
  isActive: boolean;
}>>> {
  try {
    const suppliers = await getDb().supplier.findMany({
      select: supplierListSelect,
      orderBy: [
        { isActive: "desc" },
        { name: "asc" },
        { id: "asc" },
      ],
    });
    return { ok: true, value: suppliers };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function getSupplierById(id: unknown): Promise<SupplierResult<{
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  lineContact: string | null;
  note: string | null;
  isActive: boolean;
}>> {
  const parsedId = supplierIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "NOT_FOUND" };

  try {
    const supplier = await getDb().supplier.findUnique({
      where: { id: parsedId.data },
      select: supplierDetailSelect,
    });
    return supplier
      ? { ok: true, value: supplier }
      : { ok: false, error: "NOT_FOUND" };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function createSupplier(input: unknown): Promise<SupplierResult<{
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  lineContact: string | null;
  note: string | null;
  isActive: boolean;
}>> {
  const parsed = createSupplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    const supplier = await getDb().supplier.create({
      data: parsed.data,
      select: supplierDetailSelect,
    });
    return { ok: true, value: supplier };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function updateSupplier(id: unknown, input: unknown): Promise<SupplierResult<{
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  lineContact: string | null;
  note: string | null;
  isActive: boolean;
}>> {
  const parsedId = supplierIdSchema.safeParse(id);
  const parsedInput = updateSupplierSchema.safeParse(input);
  if (!parsedId.success || !parsedInput.success) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  try {
    const existing = await getDb().supplier.findUnique({
      where: { id: parsedId.data },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "NOT_FOUND" };

    const supplier = await getDb().supplier.update({
      where: { id: parsedId.data },
      data: parsedInput.data,
      select: supplierDetailSelect,
    });
    return { ok: true, value: supplier };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function setSupplierActive(id: unknown, isActive: unknown): Promise<SupplierResult<{
  id: string;
  isActive: boolean;
}>> {
  const parsed = supplierStatusMutationSchema.safeParse({ id, isActive });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    const existing = await getDb().supplier.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "NOT_FOUND" };

    const supplier = await getDb().supplier.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.isActive },
      select: { id: true, isActive: true },
    });
    return { ok: true, value: supplier };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}
