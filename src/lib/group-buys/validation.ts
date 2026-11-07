import "server-only";

import { z } from "zod";
import { parseTaipeiDateTimeLocal } from "@/lib/group-buys/time";

const optionalText = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}, z.string().nullable().optional().transform((value) => value ?? null));

const taipeiDateTime = z.preprocess((value) => {
  if (value instanceof Date) return value;
  return typeof value === "string" ? parseTaipeiDateTimeLocal(value) ?? value : value;
}, z.date({ error: "請輸入有效的日期與時間。" }));

export const groupBuyIdSchema = z.uuid();

export const groupBuyGalleryEntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), id: z.uuid("圖片資料無效。") }).strict(),
  z.object({ kind: z.literal("pending"), uploadId: z.uuid("圖片資料無效。") }).strict(),
]);

const editableDraftFields = {
  title: z.string().trim().min(1, "請輸入團購名稱。"),
  description: optionalText,
  gallery: z.array(groupBuyGalleryEntrySchema).max(8, "每個團購最多 8 張圖片。").default([]),
  startAt: taipeiDateTime,
  endAt: taipeiDateTime,
  allowsSevenEleven: z.boolean().default(false),
};

function addAggregateRules(value: {
  startAt: Date;
  endAt: Date;
  gallery: ({ kind: "existing"; id: string } | { kind: "pending"; uploadId: string })[];
}, context: z.RefinementCtx) {
  if (value.startAt >= value.endAt) {
    context.addIssue({ code: "custom", path: ["endAt"], message: "結束時間必須晚於開始時間。" });
  }
  const existingIds = value.gallery.filter((entry) => entry.kind === "existing").map((entry) => entry.id.toLowerCase());
  const pendingIds = value.gallery.filter((entry) => entry.kind === "pending").map((entry) => entry.uploadId.toLowerCase());
  if (new Set(existingIds).size !== existingIds.length) {
    context.addIssue({ code: "custom", path: ["gallery"], message: "既有圖片不可重複。" });
  }
  if (new Set(pendingIds).size !== pendingIds.length) {
    context.addIssue({ code: "custom", path: ["gallery"], message: "新上傳圖片不可重複。" });
  }
}

export const createGroupBuyDraftSchema = z.object(editableDraftFields).strict().superRefine(addAggregateRules);
export const updateGroupBuyDraftSchema = z.object(editableDraftFields).strict().superRefine(addAggregateRules);

export type CreateGroupBuyDraftInput = z.infer<typeof createGroupBuyDraftSchema>;
export type UpdateGroupBuyDraftInput = z.infer<typeof updateGroupBuyDraftSchema>;
