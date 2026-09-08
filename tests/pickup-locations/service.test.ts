// @vitest-environment node

import { readFile } from "node:fs/promises";
import { beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => ({
  pickupLocation: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));

import {
  createPickupLocation,
  getPickupLocationById,
  listPickupLocations,
  pickupLocationSelect,
  setPickupLocationActive,
  updatePickupLocation,
} from "@/lib/pickup-locations/service";

const id = "11111111-1111-4111-8111-111111111111";
const activeLocation = {
  id,
  name: "中山取貨點",
  address: "台北市中山區中山北路一段 1 號",
  description: "側門進入",
  isActive: true,
};
const inactiveLocation = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "舊取貨點",
  address: "台北市中正區忠孝西路一段 1 號",
  description: null,
  isActive: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  db.pickupLocation.findMany.mockResolvedValue([activeLocation, inactiveLocation]);
  db.pickupLocation.findUnique.mockResolvedValue({ id });
  db.pickupLocation.create.mockResolvedValue(activeLocation);
  db.pickupLocation.update.mockResolvedValue(activeLocation);
});

test("lists active and inactive locations with explicit fields and stable ordering", async () => {
  expect(await listPickupLocations()).toEqual({ ok: true, value: [activeLocation, inactiveLocation] });
  expect(db.pickupLocation.findMany).toHaveBeenCalledExactlyOnceWith({
    select: pickupLocationSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
  });
  expect(pickupLocationSelect).toEqual({
    id: true,
    name: true,
    address: true,
    description: true,
    isActive: true,
  });
  expect(pickupLocationSelect).not.toHaveProperty("groupBuyPickups");
  expect(pickupLocationSelect).not.toHaveProperty("createdAt");
  expect(pickupLocationSelect).not.toHaveProperty("updatedAt");
  expect(db.pickupLocation.findUnique).not.toHaveBeenCalled();
});

test("detail validates UUID before querying and uses the explicit select", async () => {
  expect(await getPickupLocationById("not-a-uuid")).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.pickupLocation.findUnique).not.toHaveBeenCalled();

  db.pickupLocation.findUnique.mockResolvedValueOnce(activeLocation);
  expect(await getPickupLocationById(id)).toEqual({ ok: true, value: activeLocation });
  expect(db.pickupLocation.findUnique).toHaveBeenCalledWith({
    where: { id },
    select: pickupLocationSelect,
  });
});

test("creates normalized editable fields and relies on the database active default", async () => {
  expect((await createPickupLocation({
    name: "  中山取貨點  ",
    address: "  台北市  中山區  ",
    description: "  側門進入  ",
  })).ok).toBe(true);
  expect(db.pickupLocation.create).toHaveBeenCalledExactlyOnceWith({
    data: {
      name: "中山取貨點",
      address: "台北市  中山區",
      description: "側門進入",
    },
    select: pickupLocationSelect,
  });
  expect(db.pickupLocation.create.mock.calls[0][0].data).not.toHaveProperty("isActive");
});

test("rejects injected create status before any write", async () => {
  expect(await createPickupLocation({ ...activeLocation, isActive: false }))
    .toEqual({ ok: false, error: "INVALID_INPUT" });
  expect(db.pickupLocation.create).not.toHaveBeenCalled();
});

test("updates only normalized editable fields", async () => {
  const input = { name: "  新取貨點  ", address: "  新地址  ", description: " " };
  expect((await updatePickupLocation(id, input)).ok).toBe(true);
  expect(db.pickupLocation.update).toHaveBeenCalledExactlyOnceWith({
    where: { id },
    data: { name: "新取貨點", address: "新地址", description: null },
    select: pickupLocationSelect,
  });
  expect(db.pickupLocation.update.mock.calls[0][0].data).not.toHaveProperty("isActive");
});

test("returns NOT_FOUND for a missing update target", async () => {
  db.pickupLocation.findUnique.mockResolvedValue(null);
  expect(await updatePickupLocation(id, {
    name: "中山取貨點",
    address: "台北市中山區",
    description: null,
  })).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.pickupLocation.update).not.toHaveBeenCalled();
});

test.each([[false, "deactivate"], [true, "reactivate"]] as const)(
  "%s status operation writes only isActive, without relation checks, and is idempotent",
  async (...[isActive]) => {
    db.pickupLocation.update.mockResolvedValue({ id, isActive });
    expect(await setPickupLocationActive(id, isActive)).toEqual({ ok: true, value: { id, isActive } });
    expect(db.pickupLocation.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id },
      select: { id: true },
    });
    expect(db.pickupLocation.update).toHaveBeenCalledExactlyOnceWith({
      where: { id },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  },
);

test("status handles invalid and missing IDs safely", async () => {
  expect(await setPickupLocationActive("invalid", false)).toEqual({ ok: false, error: "INVALID_INPUT" });
  expect(db.pickupLocation.findUnique).not.toHaveBeenCalled();

  db.pickupLocation.findUnique.mockResolvedValueOnce(null);
  expect(await setPickupLocationActive(id, false)).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(db.pickupLocation.update).not.toHaveBeenCalled();
});

test.each([
  ["list", () => listPickupLocations(), () => db.pickupLocation.findMany],
  ["detail", () => getPickupLocationById(id), () => db.pickupLocation.findUnique],
  ["create", () => createPickupLocation({ name: "地點", address: "地址", description: null }), () => db.pickupLocation.create],
  ["update", () => updatePickupLocation(id, { name: "地點", address: "地址", description: null }), () => db.pickupLocation.findUnique],
] as const)("maps %s database failures to FAILED", async (_name, invoke, operation) => {
  operation().mockRejectedValueOnce(new Error("sensitive database detail"));
  expect(await invoke()).toEqual({ ok: false, error: "FAILED" });
});

test("service contains no hard delete or GroupBuyPickup write", async () => {
  const source = await readFile(new URL("../../src/lib/pickup-locations/service.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/pickupLocation\.delete(?:Many)?\s*\(/);
  expect(source).not.toMatch(/groupBuyPickup\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)/);
});
