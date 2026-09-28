import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { deriveShipmentState } from "@/lib/shipments/state";

const migration = readFileSync(resolve("prisma/migrations/20260924124409_add_shipment_domain_foundation/migration.sql"), "utf8");
const correctiveMigration = readFileSync(resolve("prisma/migrations/20260924210100_fix_shipment_text_constraints/migration.sql"), "utf8");
const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");

describe("Shipment migration and cutover boundary", () => {
  test("original applied Shipment migration remains byte-for-byte unchanged", () => {
    expect(createHash("sha256").update(readFileSync(resolve("prisma/migrations/20260924124409_add_shipment_domain_foundation/migration.sql"))).digest("hex"))
      .toBe("64a66d086784f40a499e954d71ca7112d35c0bced55c0588602171a9a5e4814b");
  });
  test("corrective migration replaces only the six text CHECKs", () => {
    const names = ["trackingNumber_trimmed", "recipientName_nonblank", "recipientPhone_nonblank",
      "sevenElevenStoreId_nonblank", "sevenElevenStoreName_nonblank", "sevenElevenStoreAddress_nonblank"];
    for (const name of names) {
      expect(correctiveMigration).toContain(`DROP CONSTRAINT "Shipment_${name}_check"`);
      expect(correctiveMigration).toContain(`ADD CONSTRAINT "Shipment_${name}_check"`);
    }
    expect(correctiveMigration).toContain("[^[:space:]");
    expect(correctiveMigration).toContain("char_length(\"trackingNumber\") BETWEEN 1 AND 128");
    expect(correctiveMigration).toContain("left(\"trackingNumber\", 1) !~");
    expect(correctiveMigration).toContain("right(\"trackingNumber\", 1) !~");
    expect(correctiveMigration).not.toMatch(/UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE|CREATE\s+INDEX|ALTER\s+TABLE\s+"Order"/i);
  });
  test("additive default-off one-to-many schema and restrictive FK", () => {
    expect(schema).toContain("enum ShipmentProvider");
    expect(schema).toMatch(/shipmentRequired\s+Boolean\s+@default\(false\)/);
    expect(schema).toContain("shipments Shipment[]");
    expect(schema).toContain("model Shipment {");
    expect(schema).toMatch(/orderId\s+String\s+@db.Uuid/);
    expect(schema).not.toMatch(/orderId\s+String\s+@unique/);
    expect(migration).toContain('"shipmentRequired" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(migration).not.toMatch(/UPDATE\s+"Order"|DELETE\s+FROM\s+"Order"/i);
  });
  test("indexes and all integrity checks exist", () => {
    for (const name of [
      "Shipment_provider_trackingNumber_key", "Shipment_orderId_createdAt_idx",
      "Shipment_one_open_per_order_key", "Order_shipment_required_method_check",
      "Shipment_arrived_after_shipped_check", "Shipment_returned_after_shipped_check",
      "Shipment_voided_before_shipped_check", "Shipment_terminal_exclusive_check",
      "Shipment_returned_after_arrived_check", "Shipment_trackingNumber_trimmed_check",
      "Shipment_recipientName_nonblank_check", "Shipment_recipientPhone_nonblank_check",
      "Shipment_sevenElevenStoreId_nonblank_check", "Shipment_sevenElevenStoreName_nonblank_check",
      "Shipment_sevenElevenStoreAddress_nonblank_check",
    ]) expect(migration).toContain(name);
    expect(migration).toMatch(/WHERE "returnedAt" IS NULL AND "voidedAt" IS NULL/);
  });
  test("production order creation does not opt into shipment", () => {
    const service = readFileSync(resolve("src/lib/orders/service.ts"), "utf8");
    const validation = readFileSync(resolve("src/lib/orders/validation.ts"), "utf8");
    expect(service).not.toContain("shipmentRequired:");
    expect(validation).not.toContain("shipmentRequired");
  });
});

describe("pure Shipment state", () => {
  const base = { id: "active", shippedAt: null, arrivedAt: null, returnedAt: null, voidedAt: null };
  const context = { pickedUpAt: null, activeShipmentId: "active", shipmentRequired: true };
  const date = new Date("2026-09-24T00:00:00Z");
  test("derives created, shipped, arrived and picked up", () => {
    expect(deriveShipmentState(base, context)).toBe("CREATED");
    expect(deriveShipmentState({ ...base, shippedAt: date }, context)).toBe("SHIPPED");
    expect(deriveShipmentState({ ...base, shippedAt: date, arrivedAt: date }, context)).toBe("ARRIVED");
    expect(deriveShipmentState({ ...base, shippedAt: date, arrivedAt: date }, { ...context, pickedUpAt: date })).toBe("PICKED_UP");
  });
  test("terminal history wins over order pickup", () => {
    expect(deriveShipmentState({ ...base, returnedAt: date }, { ...context, activeShipmentId: "replacement", pickedUpAt: date })).toBe("RETURNED");
    expect(deriveShipmentState({ ...base, voidedAt: date }, { ...context, activeShipmentId: "replacement", pickedUpAt: date })).toBe("VOIDED");
  });
  test("required pickup without qualifying current arrived row fails closed", () => {
    expect(() => deriveShipmentState(base, { ...context, pickedUpAt: date })).toThrow();
    expect(() => deriveShipmentState({ ...base, arrivedAt: date }, { ...context, activeShipmentId: "other", pickedUpAt: date })).toThrow();
  });
});
