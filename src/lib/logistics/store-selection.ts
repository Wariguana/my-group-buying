import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { publicGroupBuySlugSchema } from "@/lib/group-buys/public";
import {
  ECPAY_SEVEN_ELEVEN_SUBTYPE,
  resolveEcpaySevenElevenStore,
  type SevenElevenStore,
} from "@/lib/logistics/ecpay/store-map";
import { readEcpayLogisticsConfig } from "@/lib/logistics/ecpay/config";
import { isValidStoreSelectionBinding } from "@/lib/logistics/store-selection-cookie";

const PENDING_TTL_MS = 15 * 60 * 1000;
const READY_TTL_MS = 30 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const callbackSchema = z.strictObject({
  MerchantID: z.string().min(1).max(10),
  MerchantTradeNo: z.string().regex(/^[A-Za-z0-9]{20}$/),
  LogisticsSubType: z.literal(ECPAY_SEVEN_ELEVEN_SUBTYPE),
  CVSStoreID: z.string().regex(/^[A-Za-z0-9]{1,9}$/),
  CVSStoreName: z.string().min(1).max(10),
  CVSAddress: z.string().min(1).max(60),
  ExtraData: z.string().regex(/^[A-Za-z0-9_-]{20}$/),
});

function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export type StoreSelectionCallback = Readonly<{
  MerchantID: string;
  MerchantTradeNo: string;
  LogisticsSubType: typeof ECPAY_SEVEN_ELEVEN_SUBTYPE;
  CVSStoreID: string;
  CVSStoreName: string;
  CVSAddress: string;
  ExtraData: string;
}>;

export async function beginSevenElevenStoreSelection(
  slug: unknown,
  browserBinding: unknown,
  now: Date = new Date(),
): Promise<Readonly<{ state: string }>> {
  const parsedSlug = publicGroupBuySlugSchema.safeParse(slug);
  if (
    !parsedSlug.success
    || !isValidStoreSelectionBinding(browserBinding)
    || Number.isNaN(now.getTime())
  ) throw new Error("STORE_SELECTION_UNAVAILABLE");
  const state = randomToken(15);
  const merchantTradeNo = randomBytes(10).toString("hex");
  const groupBuy = await getDb().groupBuy.findFirst({
    where: {
      slug: parsedSlug.data,
      status: "PUBLISHED",
      allowsSevenEleven: true,
      startAt: { lte: now },
      endAt: { gt: now },
    },
    select: { id: true },
  });
  if (!groupBuy) throw new Error("STORE_SELECTION_UNAVAILABLE");
  await getDb().sevenElevenStoreSelection.create({
    data: {
      stateHash: hashToken(state),
      merchantTradeNo,
      browserBindingHash: hashToken(browserBinding),
      groupBuyId: groupBuy.id,
      expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
    },
    select: { id: true },
  });
  return Object.freeze({ state });
}

export async function getPendingSevenElevenMapRequest(state: unknown, now: Date = new Date()) {
  if (typeof state !== "string" || !TOKEN_PATTERN.test(state) || Number.isNaN(now.getTime())) return null;
  const pending = await getDb().sevenElevenStoreSelection.findFirst({
    where: {
      stateHash: hashToken(state),
      expiresAt: { gt: now },
      selectionTokenHash: null,
      consumedAt: null,
    },
    select: { merchantTradeNo: true },
  });
  return pending ? Object.freeze({ state, merchantTradeNo: pending.merchantTradeNo }) : null;
}

export async function completeSevenElevenStoreSelection(
  callback: unknown,
  options: Readonly<{
    now?: Date;
    resolveStore?: (storeId: string) => Promise<SevenElevenStore | null>;
    merchantId?: string;
  }> = {},
): Promise<Readonly<{ slug: string; selectionToken: string }> | null> {
  const parsed = callbackSchema.safeParse(callback);
  const now = options.now ?? new Date();
  if (!parsed.success || Number.isNaN(now.getTime())) return null;
  const merchantId = options.merchantId ?? readEcpayLogisticsConfig().merchantId;
  if (parsed.data.MerchantID !== merchantId) return null;

  const pending = await getDb().sevenElevenStoreSelection.findFirst({
    where: {
      stateHash: hashToken(parsed.data.ExtraData),
      merchantTradeNo: parsed.data.MerchantTradeNo,
      expiresAt: { gt: now },
      selectionTokenHash: null,
      consumedAt: null,
    },
    select: { id: true, groupBuy: { select: { slug: true, allowsSevenEleven: true } } },
  });
  if (!pending?.groupBuy.allowsSevenEleven) return null;

  const store = await (options.resolveStore ?? resolveEcpaySevenElevenStore)(parsed.data.CVSStoreID);
  if (!store) return null;
  const selectionToken = randomToken(32);
  const updated = await getDb().sevenElevenStoreSelection.updateMany({
    where: {
      id: pending.id,
      selectionTokenHash: null,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      selectionTokenHash: hashToken(selectionToken),
      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      expiresAt: new Date(now.getTime() + READY_TTL_MS),
    },
  });
  return updated.count === 1
    ? Object.freeze({ slug: pending.groupBuy.slug, selectionToken })
    : null;
}

export async function getSevenElevenStoreSelectionForPage(
  slug: unknown,
  selectionToken: unknown,
  browserBinding: unknown,
  now: Date = new Date(),
): Promise<SevenElevenStore | null> {
  const parsedSlug = publicGroupBuySlugSchema.safeParse(slug);
  if (
    !parsedSlug.success
    || typeof selectionToken !== "string"
    || typeof browserBinding !== "string"
    || !TOKEN_PATTERN.test(selectionToken)
    || !TOKEN_PATTERN.test(browserBinding)
    || Number.isNaN(now.getTime())
  ) return null;
  const selection = await getDb().sevenElevenStoreSelection.findFirst({
    where: {
      selectionTokenHash: hashToken(selectionToken),
      browserBindingHash: hashToken(browserBinding),
      expiresAt: { gt: now },
      consumedAt: null,
      groupBuy: { slug: parsedSlug.data, allowsSevenEleven: true },
    },
    select: { storeId: true, storeName: true, storeAddress: true },
  });
  return selection?.storeId && selection.storeName && selection.storeAddress
    ? Object.freeze({ id: selection.storeId, name: selection.storeName, address: selection.storeAddress })
    : null;
}

export async function resolveSevenElevenSelectionForOrder(
  tx: Prisma.TransactionClient,
  groupBuyId: string,
  selectionToken: string,
  browserBinding: string,
  now: Date,
) {
  return tx.sevenElevenStoreSelection.findFirst({
    where: {
      groupBuyId,
      selectionTokenHash: hashToken(selectionToken),
      browserBindingHash: hashToken(browserBinding),
      expiresAt: { gt: now },
      consumedAt: null,
    },
    select: { id: true, storeId: true, storeName: true, storeAddress: true },
  });
}

export async function consumeSevenElevenSelection(
  tx: Prisma.TransactionClient,
  selectionId: string,
  orderId: string,
  now: Date,
): Promise<boolean> {
  const result = await tx.sevenElevenStoreSelection.updateMany({
    where: { id: selectionId, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now, orderId },
  });
  return result.count === 1;
}
