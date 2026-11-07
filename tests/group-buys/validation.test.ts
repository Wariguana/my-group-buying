// @vitest-environment node

import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createGroupBuyDraftSchema,
  updateGroupBuyDraftSchema,
} from "@/lib/group-buys/validation";
import { formatTaipeiDateTimeLocal, parseTaipeiDateTimeLocal } from "@/lib/group-buys/time";

const imageId = "55555555-5555-4555-8555-555555555555";
const uploadId = "66666666-6666-4666-8666-666666666666";

function validInput() {
  return {
    title: "  中秋團購  ",
    description: "  保留內文  ",
    gallery: [],
    startAt: "2026-09-01T10:00",
    endAt: "2026-09-02T10:00",
  };
}

test("normalizes draft text and Taiwan datetime-local values", () => {
  const value = createGroupBuyDraftSchema.parse(validInput());
  expect(value).toMatchObject({ title: "中秋團購", description: "保留內文", gallery: [] });
  expect(value.startAt.toISOString()).toBe("2026-09-01T02:00:00.000Z");
  expect(value.endAt.toISOString()).toBe("2026-09-02T02:00:00.000Z");
  expect(formatTaipeiDateTimeLocal(value.startAt)).toBe("2026-09-01T10:00");
});

test("blank optional text becomes null and blank title is rejected", () => {
  expect(createGroupBuyDraftSchema.parse({ ...validInput(), description: " " })).toMatchObject({ description: null });
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), title: "  " }).success).toBe(false);
});

test("validates gallery identities, duplicates, maximum size, and rejects the legacy URL field", () => {
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), gallery: [{ kind: "existing", id: imageId }, { kind: "pending", uploadId }] }).success).toBe(true);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), gallery: [{ kind: "existing", id: imageId }, { kind: "existing", id: imageId }] }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), gallery: [{ kind: "pending", uploadId }, { kind: "pending", uploadId }] }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), gallery: Array.from({ length: 9 }, (_, index) => ({ kind: "pending", uploadId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` })) }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), coverImageUrl: "https://example.com/a.jpg" }).success).toBe(false);
});

test("accepts past draft windows and requires strictly increasing timestamps", () => {
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), startAt: "2020-01-01T00:00", endAt: "2020-01-02T00:00" }).success).toBe(true);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), endAt: "2026-09-01T10:00" }).success).toBe(false);
  expect(createGroupBuyDraftSchema.safeParse({ ...validInput(), endAt: "2026-08-31T10:00" }).success).toBe(false);
  expect(parseTaipeiDateTimeLocal("2026-02-30T10:00")).toBeNull();
});

test.each([
  ["top-level status", { status: "PUBLISHED" }],
  ["top-level slug", { slug: "client-slug" }],
  ["top-level publishedAt", { publishedAt: null }],
] as const)("strict schemas reject %s injection", (_name, injected) => {
  expect(updateGroupBuyDraftSchema.safeParse({ ...validInput(), ...injected }).success).toBe(false);
});

test("keeps only the shared 7-ELEVEN flag with a safe default", () => {
  expect(createGroupBuyDraftSchema.parse(validInput()).allowsSevenEleven).toBe(false);
  expect(createGroupBuyDraftSchema.parse({ ...validInput(), allowsSevenEleven: true }).allowsSevenEleven).toBe(true);
});
test.each([{ items: [] }, { pickups: [] }, { allowsSelfPickup: true }])("both strict schemas reject retired configuration %j", injected => {
  for (const schema of [createGroupBuyDraftSchema, updateGroupBuyDraftSchema]) {
    expect(schema.safeParse({ ...validInput(), ...injected }).success).toBe(false);
  }
});
