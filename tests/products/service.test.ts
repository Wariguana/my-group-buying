// @vitest-environment node

import { readFile } from "node:fs/promises";
import { beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  product: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  supplier: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import {
  createProduct,
  getProductById,
  listProducts,
  listProductSupplierOptions,
  productDetailSelect,
  productListSelect,
  productSupplierOptionSelect,
  setProductActive,
  updateProduct,
} from "@/lib/products/service";

const id = "11111111-1111-4111-8111-111111111111";
const activeSupplierId = "22222222-2222-4222-8222-222222222222";
const inactiveSupplierId = "33333333-3333-4333-8333-333333333333";
const input = {
  name: "  鳳梨酥  ",
  description: "  十二入  ",
  imageUrl: " https://example.com/product.jpg ",
  defaultPrice: "1200",
  cost: "800",
  unit: "  盒  ",
  supplierId: activeSupplierId,
};
const normalizedInput = {
  name: "鳳梨酥",
  description: "十二入",
  imageUrl: "https://example.com/product.jpg",
  defaultPrice: 1200,
  cost: 800,
  unit: "盒",
  supplierId: activeSupplierId,
};
const product = { id, ...normalizedInput, isActive: true };

beforeEach(() => {
  vi.resetAllMocks();
  db.product.findMany.mockResolvedValue([product]);
  db.product.findUnique.mockResolvedValue({ id, supplierId: activeSupplierId });
  db.product.create.mockResolvedValue(product);
  db.product.update.mockResolvedValue(product);
  db.supplier.findMany.mockResolvedValue([]);
  db.supplier.findFirst.mockResolvedValue({ id: activeSupplierId });
});

test("lists active and inactive Products with explicit fields and stable ordering", async () => {
  expect(await listProducts()).toEqual({ ok: true, value: [product] });
  expect(db.product.findMany).toHaveBeenCalledExactlyOnceWith({
    select: productListSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
  });
  expect(productListSelect).not.toHaveProperty("description");
  expect(productListSelect).not.toHaveProperty("imageUrl");
  expect(productListSelect).not.toHaveProperty("groupBuyItems");
});

test("detail validates IDs and uses an explicit select", async () => {
  expect(await getProductById("not-a-uuid")).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.product.findUnique).not.toHaveBeenCalled();

  db.product.findUnique.mockResolvedValueOnce(product);
  expect((await getProductById(id)).ok).toBe(true);
  expect(db.product.findUnique).toHaveBeenCalledWith({ where: { id }, select: productDetailSelect });
  expect(productDetailSelect).not.toHaveProperty("groupBuyItems");
});

test("creates normalized editable data and relies on the database active default", async () => {
  expect((await createProduct(input)).ok).toBe(true);
  expect(db.supplier.findFirst).toHaveBeenCalledWith({
    where: { id: activeSupplierId, isActive: true },
    select: { id: true },
  });
  expect(db.product.create).toHaveBeenCalledExactlyOnceWith({ data: normalizedInput, select: productDetailSelect });
  expect(db.product.create.mock.calls[0][0].data).not.toHaveProperty("isActive");
});

test("creates without a Supplier and performs no Supplier lookup", async () => {
  expect((await createProduct({ ...input, supplierId: "" })).ok).toBe(true);
  expect(db.supplier.findFirst).not.toHaveBeenCalled();
  expect(db.product.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ supplierId: null }),
  }));
});

test.each(["missing", "inactive"])("rejects an unavailable %s Supplier on create", async () => {
  db.supplier.findFirst.mockResolvedValue(null);
  expect(await createProduct(input)).toEqual({ ok: false, error: "SUPPLIER_UNAVAILABLE" });
  expect(db.product.create).not.toHaveBeenCalled();
});

test("returns NOT_FOUND when updating a missing Product", async () => {
  db.product.findUnique.mockResolvedValue(null);
  expect(await updateProduct(id, input)).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.product.update).not.toHaveBeenCalled();
});

test.each([
  ["clear", activeSupplierId, "", false],
  ["same active", activeSupplierId, activeSupplierId, false],
  ["same inactive", inactiveSupplierId, inactiveSupplierId, false],
  ["switch active", inactiveSupplierId, activeSupplierId, true],
] as const)("allows Supplier update policy: %s", async (_name, currentId, nextId, expectsLookup) => {
  db.product.findUnique.mockResolvedValue({ id, supplierId: currentId });
  expect((await updateProduct(id, { ...input, supplierId: nextId })).ok).toBe(true);
  expect(db.supplier.findFirst).toHaveBeenCalledTimes(expectsLookup ? 1 : 0);
  expect(db.product.update).toHaveBeenCalledWith({
    where: { id },
    data: { ...normalizedInput, supplierId: nextId || null },
    select: productDetailSelect,
  });
  expect(db.product.update.mock.calls[0][0].data).not.toHaveProperty("isActive");
});

test.each(["inactive", "missing"])("rejects switching to an %s Supplier", async () => {
  db.product.findUnique.mockResolvedValue({ id, supplierId: inactiveSupplierId });
  db.supplier.findFirst.mockResolvedValue(null);
  expect(await updateProduct(id, input)).toEqual({ ok: false, error: "SUPPLIER_UNAVAILABLE" });
  expect(db.product.update).not.toHaveBeenCalled();
});

test("new Supplier options query returns active Suppliers only with a narrow select", async () => {
  await listProductSupplierOptions();
  expect(db.supplier.findMany).toHaveBeenCalledExactlyOnceWith({
    where: { isActive: true },
    select: productSupplierOptionSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  expect(productSupplierOptionSelect).toEqual({ id: true, name: true, isActive: true });
});

test("edit Supplier options include and de-duplicate the current inactive Supplier", async () => {
  const current = { id: inactiveSupplierId, name: "停用供應商", isActive: false };
  db.supplier.findMany.mockResolvedValue([current, current]);
  expect(await listProductSupplierOptions(inactiveSupplierId)).toEqual({ ok: true, value: [current] });
  expect(db.supplier.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { OR: [{ isActive: true }, { id: inactiveSupplierId }] },
  }));
});

test.each([[false, "deactivate"], [true, "reactivate"]] as const)(
  "%s status operation writes only isActive and is idempotent",
  async (...[isActive]) => {
    db.product.update.mockResolvedValue({ id, isActive });
    expect(await setProductActive(id, isActive)).toEqual({ ok: true, value: { id, isActive } });
    expect(db.product.update).toHaveBeenCalledExactlyOnceWith({
      where: { id }, data: { isActive }, select: { id: true, isActive: true },
    });
  },
);

test("status handles invalid and missing IDs safely", async () => {
  expect(await setProductActive("invalid", false)).toEqual({ ok: false, error: "INVALID_INPUT" });
  db.product.findUnique.mockResolvedValueOnce(null);
  expect(await setProductActive(id, false)).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.product.update).not.toHaveBeenCalled();
});

test.each([
  ["list", () => listProducts(), () => db.product.findMany],
  ["detail", () => getProductById(id), () => db.product.findUnique],
  ["create", () => createProduct({ ...input, supplierId: "" }), () => db.product.create],
  ["update", () => updateProduct(id, { ...input, supplierId: activeSupplierId }), () => db.product.findUnique],
  ["selector", () => listProductSupplierOptions(), () => db.supplier.findMany],
] as const)("maps %s ORM failures to FAILED", async (_name, invoke, operation) => {
  operation().mockRejectedValueOnce(new Error("sensitive database detail"));
  expect(await invoke()).toEqual({ ok: false, error: "FAILED" });
});

test("Product service contains no hard-delete or GroupBuyItem write", async () => {
  const source = await readFile(new URL("../../src/lib/products/service.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/product\.delete(?:Many)?\s*\(/);
  expect(source).not.toMatch(/groupBuyItem\.(?:create|update|delete|upsert)/);
});
