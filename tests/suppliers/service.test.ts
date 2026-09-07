// @vitest-environment node

import { readFile } from "node:fs/promises";
import { beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  supplier: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import {
  createSupplier,
  getSupplierById,
  listSuppliers,
  setSupplierActive,
  supplierDetailSelect,
  supplierListSelect,
  updateSupplier,
} from "@/lib/suppliers/service";

const id = "11111111-1111-4111-8111-111111111111";
const supplier = {
  id,
  name: "供應商甲",
  contactName: "王小明",
  phone: null,
  lineContact: null,
  note: null,
  isActive: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  db.supplier.findMany.mockResolvedValue([supplier]);
  db.supplier.findUnique.mockResolvedValue({ id });
  db.supplier.create.mockResolvedValue(supplier);
  db.supplier.update.mockResolvedValue(supplier);
});

test("lists active and inactive suppliers with explicit fields and stable ordering", async () => {
  expect(await listSuppliers()).toEqual({ ok: true, value: [supplier] });
  expect(db.supplier.findMany).toHaveBeenCalledExactlyOnceWith({
    select: supplierListSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
  });
  expect(supplierListSelect).not.toHaveProperty("products");
  expect(db.supplier.findUnique).not.toHaveBeenCalled();
});

test("creates with normalized editable fields and relies on the database active default", async () => {
  const result = await createSupplier({
    name: "  供應商甲  ",
    contactName: "  王小明  ",
    phone: " ",
    lineContact: "",
    note: "  備註  ",
  });
  expect(result.ok).toBe(true);
  expect(db.supplier.create).toHaveBeenCalledExactlyOnceWith({
    data: {
      name: "供應商甲",
      contactName: "王小明",
      phone: null,
      lineContact: null,
      note: "備註",
    },
    select: supplierDetailSelect,
  });
  expect(db.supplier.create.mock.calls[0][0].data).not.toHaveProperty("isActive");
});

test("rejects injected create status before any write", async () => {
  expect(await createSupplier({ name: "供應商甲", isActive: false })).toEqual({ ok: false, error: "INVALID_INPUT" });
  expect(db.supplier.create).not.toHaveBeenCalled();
});

test("updates only normalized editable fields", async () => {
  const input = { name: "  新名稱  ", contactName: " ", phone: "  02-1234  ", lineContact: " ", note: "  新備註  " };
  expect((await updateSupplier(id, input)).ok).toBe(true);
  expect(db.supplier.update).toHaveBeenCalledExactlyOnceWith({
    where: { id },
    data: { name: "新名稱", contactName: null, phone: "02-1234", lineContact: null, note: "新備註" },
    select: supplierDetailSelect,
  });
});

test("handles invalid and missing IDs without unsafe writes", async () => {
  expect(await getSupplierById("not-a-uuid")).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.supplier.findUnique).not.toHaveBeenCalled();

  db.supplier.findUnique.mockResolvedValueOnce(null);
  expect(await getSupplierById(id)).toEqual({ ok: false, error: "NOT_FOUND" });

  db.supplier.findUnique.mockResolvedValueOnce(null);
  expect(await updateSupplier(id, { name: "供應商甲" })).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.supplier.update).not.toHaveBeenCalled();
});

test.each([[false, "deactivate"], [true, "reactivate"]] as const)(
  "%s status operation writes only isActive and remains idempotent",
  async (...[isActive]) => {
    db.supplier.update.mockResolvedValue({ id, isActive });
    expect(await setSupplierActive(id, isActive)).toEqual({ ok: true, value: { id, isActive } });
    expect(db.supplier.update).toHaveBeenCalledExactlyOnceWith({
      where: { id },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  },
);

test.each(["findMany", "findUnique", "create", "update"] as const)(
  "maps %s database failures to a safe domain failure",
  async (operation) => {
    db.supplier[operation].mockRejectedValueOnce(new Error("sensitive database detail"));
    const result = operation === "findMany"
      ? await listSuppliers()
      : operation === "create"
        ? await createSupplier({ name: "供應商甲" })
        : operation === "update"
          ? await updateSupplier(id, { name: "供應商甲" })
          : await getSupplierById(id);
    expect(result).toEqual({ ok: false, error: "FAILED" });
  },
);

test("supplier service contains no hard-delete operation", async () => {
  const source = await readFile(new URL("../../src/lib/suppliers/service.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/supplier\.delete(?:Many)?\s*\(/);
});
