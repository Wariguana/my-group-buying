import "server-only";

import { getDb } from "@/lib/db";
import {
  createProductSchema,
  productIdSchema,
  productStatusMutationSchema,
  updateProductSchema,
} from "@/lib/products/validation";

export type ProductErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "SUPPLIER_UNAVAILABLE"
  | "FAILED";

export type ProductResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProductErrorCode };

export const productListSelect = {
  id: true,
  name: true,
  defaultPrice: true,
  cost: true,
  unit: true,
  isActive: true,
  supplier: {
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  },
} as const;

export const productDetailSelect = {
  id: true,
  name: true,
  description: true,
  imageUrl: true,
  defaultPrice: true,
  cost: true,
  unit: true,
  supplierId: true,
  isActive: true,
} as const;

export const productSupplierOptionSelect = {
  id: true,
  name: true,
  isActive: true,
} as const;

type ProductListItem = {
  id: string;
  name: string;
  defaultPrice: number;
  cost: number;
  unit: string;
  isActive: boolean;
  supplier: { id: string; name: string; isActive: boolean } | null;
};

type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  defaultPrice: number;
  cost: number;
  unit: string;
  supplierId: string | null;
  isActive: boolean;
};

type SupplierOption = { id: string; name: string; isActive: boolean };

export async function listProducts(): Promise<ProductResult<ProductListItem[]>> {
  try {
    const products = await getDb().product.findMany({
      select: productListSelect,
      orderBy: [
        { isActive: "desc" },
        { name: "asc" },
        { id: "asc" },
      ],
    });
    return { ok: true, value: products };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function getProductById(id: unknown): Promise<ProductResult<ProductDetail>> {
  const parsedId = productIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "NOT_FOUND" };

  try {
    const product = await getDb().product.findUnique({
      where: { id: parsedId.data },
      select: productDetailSelect,
    });
    return product
      ? { ok: true, value: product }
      : { ok: false, error: "NOT_FOUND" };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function listProductSupplierOptions(
  currentSupplierId?: unknown,
): Promise<ProductResult<SupplierOption[]>> {
  const parsedCurrentId = currentSupplierId == null
    ? { success: true as const, data: null }
    : productIdSchema.safeParse(currentSupplierId);
  if (!parsedCurrentId.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    const suppliers = await getDb().supplier.findMany({
      where: parsedCurrentId.data
        ? { OR: [{ isActive: true }, { id: parsedCurrentId.data }] }
        : { isActive: true },
      select: productSupplierOptionSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return {
      ok: true,
      value: [...new Map(suppliers.map((supplier) => [supplier.id, supplier])).values()],
    };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function createProduct(input: unknown): Promise<ProductResult<ProductDetail>> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    if (parsed.data.supplierId) {
      const supplier = await getDb().supplier.findFirst({
        where: { id: parsed.data.supplierId, isActive: true },
        select: { id: true },
      });
      if (!supplier) return { ok: false, error: "SUPPLIER_UNAVAILABLE" };
    }

    // A concurrent Supplier deactivation after this check does not invalidate
    // the Product relationship; Phase 1 intentionally does not add locking.
    const product = await getDb().product.create({
      data: parsed.data,
      select: productDetailSelect,
    });
    return { ok: true, value: product };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function updateProduct(id: unknown, input: unknown): Promise<ProductResult<ProductDetail>> {
  const parsedId = productIdSchema.safeParse(id);
  const parsedInput = updateProductSchema.safeParse(input);
  if (!parsedId.success || !parsedInput.success) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  try {
    const existing = await getDb().product.findUnique({
      where: { id: parsedId.data },
      select: { id: true, supplierId: true },
    });
    if (!existing) return { ok: false, error: "NOT_FOUND" };

    const nextSupplierId = parsedInput.data.supplierId;
    if (nextSupplierId && nextSupplierId !== existing.supplierId) {
      const supplier = await getDb().supplier.findFirst({
        where: { id: nextSupplierId, isActive: true },
        select: { id: true },
      });
      if (!supplier) return { ok: false, error: "SUPPLIER_UNAVAILABLE" };
    }

    const product = await getDb().product.update({
      where: { id: parsedId.data },
      data: parsedInput.data,
      select: productDetailSelect,
    });
    return { ok: true, value: product };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}

export async function setProductActive(
  id: unknown,
  isActive: unknown,
): Promise<ProductResult<{ id: string; isActive: boolean }>> {
  const parsed = productStatusMutationSchema.safeParse({ id, isActive });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    const existing = await getDb().product.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "NOT_FOUND" };

    const product = await getDb().product.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.isActive },
      select: { id: true, isActive: true },
    });
    return { ok: true, value: product };
  } catch {
    return { ok: false, error: "FAILED" };
  }
}
