// @vitest-environment node
import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminCreateShipmentInputSchema, adminTransitionShipmentInputSchema } from "@/lib/shipments/validation";
const input = { publicCode: "ord-AbCdEf0123_-xyZ9", trackingNumber: "  編號 / 123  " };
test("create trims plain-text tracking without speculative provider pattern", () => {
  expect(adminCreateShipmentInputSchema.parse(input)).toEqual({ ...input, trackingNumber: "編號 / 123" });
  expect(adminCreateShipmentInputSchema.safeParse({ ...input, trackingNumber: "x".repeat(128) }).success).toBe(true);
});
test.each(["", "  ", "x".repeat(129), null, 123, new Blob(["input"])])("invalid tracking %s", (trackingNumber) => {
  expect(adminCreateShipmentInputSchema.safeParse({ ...input, trackingNumber }).success).toBe(false);
});
test.each(["bad", " ord-AbCdEf0123_-xyZ9", null])("invalid public code %s", (publicCode) => {
  expect(adminCreateShipmentInputSchema.safeParse({ ...input, publicCode }).success).toBe(false);
});
test("schemas are strict and transition ID must be canonical UUID", () => {
  const shipmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  expect(adminTransitionShipmentInputSchema.parse({ shipmentId })).toEqual({ shipmentId });
  for (const value of [shipmentId.toUpperCase(), ` ${shipmentId}`, "bad", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]) {
    expect(adminTransitionShipmentInputSchema.safeParse({ shipmentId: value }).success).toBe(false);
  }
  expect(adminTransitionShipmentInputSchema.safeParse({ shipmentId, publicCode: input.publicCode }).success).toBe(false);
  expect(adminCreateShipmentInputSchema.safeParse({ ...input, provider: "SEVEN_ELEVEN_MYSHIP" }).success).toBe(false);
});
