import "server-only";
import { assertDeployment, featureEnabled } from "@/lib/operations/config";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { id } from "@/lib/commerce/validation";
import { checkoutInput, receiptInput } from "./validation";
import { shippingQuote, safeAmount } from "./shipping";
import { normalizeScreenshot } from "./screenshot";
import { formatTaipeiOrderDate } from "@/lib/orders/order-number";
import { resolveSevenElevenSelectionForOrder } from "@/lib/logistics/store-selection";
import { notify } from "@/lib/qbuy/service";
type Tx = Prisma.TransactionClient;
async function appendRefund(tx: Tx, checkoutId: string, reason: string, total: number, eventKey: string) {
 const existing = await tx.refundObligation.aggregate({where:{checkoutId,reason},_sum:{amount:true}});
 const amount=total-(existing._sum.amount??0);
 if(amount>0)await tx.refundObligation.create({data:{checkoutId,reason,amount,eventKey}});
}
const include = { items: true, fulfillmentGroups: true, payment: { include: { receipts: true } }, orders: true, refunds: true } as const;
export class CheckoutError extends Error {
}
const fail = (message: string): never => { throw new CheckoutError(message); };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
async function audit(tx: Tx, checkoutId: string, event: string, detail: unknown, actorId?: string) {
    await tx.checkoutAudit.create({ data: { checkoutId, event, detail: json(detail), actorId } });
}
async function lock(tx: Tx, checkoutId: string) {
    await tx.$queryRaw `SELECT id FROM "Checkout" WHERE id = ${checkoutId}::uuid FOR UPDATE`;
}
async function changeStock(tx: Tx, checkoutId: string, demand: Map<string, number>, kind: "RESERVE" | "RELEASE" | "ALLOCATE", actorId?: string) {
    const skus = await tx.productSku.findMany({ where: { id: { in: [...demand.keys()] } }, orderBy: { productId: "asc" } });
    for (const productId of [...new Set(skus.map(s => s.productId))].sort())
        await tx.$queryRaw `SELECT id FROM "Product" WHERE id = ${productId}::uuid FOR UPDATE`;
    for (const skuId of [...demand.keys()].sort()) {
        const quantity = demand.get(skuId)!;
        const stock = await tx.skuInventory.findUniqueOrThrow({ where: { skuId } });
        const reserved = stock.reserved + (kind === "RESERVE" ? quantity : -quantity);
        const allocated = stock.allocated + (kind === "ALLOCATE" ? quantity : 0);
        if (reserved < 0 || reserved + allocated > stock.onHand)
            fail("庫存不足，請重新整理購物車。");
        await tx.skuInventory.update({ where: { skuId }, data: { reserved, allocated, version: { increment: 1 } } });
        await tx.inventoryMovement.create({ data: { requestId: randomUUID(), skuId, actorId, checkoutId, kind,
                beforeOnHand: stock.onHand, afterOnHand: stock.onHand, beforeReserved: stock.reserved, beforeAllocated: stock.allocated,
                reserved, allocated, reason: `Checkout ${kind}` } });
    }
}
function demands(items: {
    skuId: string;
    quantity: number;
}[]) {
    const result = new Map<string, number>();
    for (const item of items)
        result.set(item.skuId, (result.get(item.skuId) ?? 0) + item.quantity);
    return result;
}
// Authenticated server callers only. Ownership is enforced again on every read/mutation.
export async function createCheckout(raw: unknown, customerAccountId: string, browserBinding = "", quoteOnly = false) {
    if (["production", "staging"].includes(process.env.QBUY_ENV ?? "")) assertDeployment();
    if (!featureEnabled("CHECKOUT") || !featureEnabled("BANK_DETAILS")) fail("目前暫停新結帳，請聯絡客服。");
    if (process.env.QBUY_ENV === "production") {
        const heartbeat = await getDb().workerHeartbeat.findUnique({ where: { name: "checkouts" } });
        if (!heartbeat?.lastSuccessAt || heartbeat.lastError || Date.now() - heartbeat.lastSuccessAt.getTime() > 180000) fail("結帳暫停，請稍後再試。");
    }
    const input = checkoutInput.parse(raw);
    if (!featureEnabled(input.method)) fail("此配送方式尚未開放。");
    id.parse(customerAccountId);
    const { quoteFingerprint: comparisonOnly, ...identity } = input;
    void comparisonOnly;
    const requestHash = createHash("sha256").update(JSON.stringify({ ...identity, lines: [...input.lines].sort((a, b) => a.offerId.localeCompare(b.offerId)) })).digest("hex");
    return getDb().$transaction(async (tx) => {
        await tx.$queryRaw `SELECT id FROM "CustomerAccount" WHERE id = ${customerAccountId}::uuid FOR UPDATE`;
        if (!await tx.customerAccount.findUnique({ where: { id: customerAccountId } }))
            fail("請先 LINE 登入。");
        const previous = await tx.checkout.findUnique({ where: { customerAccountId_requestId: { customerAccountId, requestId: input.requestId } } });
        if (previous) {
            if (previous.requestHash !== requestHash)
                fail("此結帳識別碼已用於其他內容。");
            return { id: previous.id, subtotal: previous.subtotal, shippingAmount: previous.shippingAmount, totalAmount: previous.totalAmount };
        }
        const offerIds = input.lines.map(l => l.offerId);
        const identities = await tx.groupBuySku.findMany({ where: { id: { in: offerIds } }, include: { sku: true } });
        for (const productId of [...new Set(identities.map(o => o.sku.productId))].sort())
            await tx.$queryRaw `SELECT id FROM "Product" WHERE id = ${productId}::uuid FOR UPDATE`;
        for (const groupId of [...new Set(identities.map(o => o.groupBuyId))].sort())
            await tx.$queryRaw `SELECT id FROM "GroupBuy" WHERE id = ${groupId}::uuid FOR SHARE`;
        for (const offerId of [...offerIds].sort())
            await tx.$queryRaw `SELECT id FROM "GroupBuySku" WHERE id = ${offerId}::uuid FOR SHARE`;
        for (const skuId of [...new Set(identities.map(o => o.skuId))].sort())
            await tx.$queryRaw `SELECT id FROM "ProductSku" WHERE id = ${skuId}::uuid FOR SHARE`;
        await tx.$queryRaw `SELECT id FROM "CheckoutSettings" FOR SHARE`;
        await tx.$queryRaw `SELECT id FROM "ShippingRate" ORDER BY id FOR SHARE`;
        const settings = await tx.checkoutSettings.findUnique({ where: { id: "default" } });
        if (!settings?.enabled)
            fail("尚未開放銀行轉帳結帳。");
        const offers = await tx.groupBuySku.findMany({ where: { id: { in: offerIds } }, include: { groupBuy: true, sku: { include: { product: true, inventory: true, options: { include: { optionValue: { include: { option: true } } } } } } } });
        const now = new Date();
        const lines = input.lines.map(line => {
            const o = offers.find(o => o.id === line.offerId);
            if (!o || !o.isActive || !o.sku.isActive || !o.sku.product.isActive || !o.sku.product.skuInventoryEnabled || !o.sku.inventory ||
                o.groupBuy.status !== "PUBLISHED" || o.groupBuy.isArchived || o.groupBuy.startAt > now || o.groupBuy.endAt <= now ||
                o.salePrice !== line.expectedPrice || (o.purchaseLimit !== null && line.quantity > o.purchaseLimit))
                return fail("商品價格、庫存權威或販售狀態已變更。");
            return { ...line, offer: o, skuId: o.skuId, groupBuyId: o.groupBuyId, price: o.salePrice, canCombine: o.groupBuy.allowsCombinedShipping,
                endAt: o.groupBuy.endAt, temperature: o.sku.temperature, methods: o.sku.shippingMethods, weightGrams: o.sku.weightGrams,
                lengthMm: o.sku.lengthMm, widthMm: o.sku.widthMm, heightMm: o.sku.heightMm, note: o.sku.shippingNote };
        });
        for (const [skuId, quantity] of demands(lines)) {
            const stock = offers.find(o => o.skuId === skuId)!.sku.inventory!;
            if (quantity > stock.onHand - stock.reserved - stock.allocated)
                fail("跨團合計庫存不足。");
        }
        const quote = shippingQuote(lines, input.method, await tx.shippingRate.findMany());
        let delivery: Prisma.InputJsonValue = { method: input.method, address: input.address };
        let selectionId: string | undefined;
        if (input.method === "HOME_DELIVERY") {
            if (input.address.length < 8)
                fail("請填寫完整宅配地址。");
        }
        else if (input.method === "SEVEN_ELEVEN") {
            if (lines.some(l => !l.offer.groupBuy.allowsSevenEleven))
                return fail("開團未開放 7-ELEVEN 配送。");
            const selection = await resolveSevenElevenSelectionForOrder(tx, lines[0].groupBuyId, input.selectionToken ?? "", browserBinding, now);
            if (!selection?.storeId || !selection.storeName || !selection.storeAddress)
                return fail("請透過已驗證的 7-ELEVEN 選店流程選擇門市。");
            selectionId = selection.id;
            delivery = { method: input.method, storeId: selection.storeId, storeName: selection.storeName, address: selection.storeAddress };
        }
        else {
            if (!input.familyStoreId)
                return fail("請選擇已核實的全家門市。");
            await tx.$queryRaw `SELECT id FROM "VerifiedPickupStore" WHERE id=${input.familyStoreId}::uuid FOR SHARE`;
            const store = await tx.verifiedPickupStore.findFirst({ where: { id: input.familyStoreId, isActive: true } });
            if (!store)
                return fail("全家門市未核實或已停用。");
            delivery = { method: input.method, storeId: store.id, storeCode: store.code, storeName: store.name, address: store.address };
        }
        const quoteFingerprint = createHash("sha256").update(JSON.stringify({ total: quote.totalAmount, groups: quote.groups.map(g => ({ key: g.key, rate: g.rate, waitUntil: g.waitUntil, offers: g.lines.map(l => l.offerId) })), delivery })).digest("hex");
        if (!quoteOnly && input.quoteFingerprint && input.quoteFingerprint !== quoteFingerprint)
            return fail("配送報價已變更，請重新計算並確認。");
        if (quoteOnly)
            return { id: null, quoteFingerprint, subtotal: quote.subtotal, shippingAmount: quote.shippingAmount, totalAmount: quote.totalAmount,
                groups: quote.groups.map(g => ({ temperature: g.rate.temperature, subtotal: g.subtotal, shippingAmount: g.shippingAmount,
                    freeThreshold: g.rate.freeThreshold, waitUntil: g.waitUntil.toISOString(),
                    items: g.lines.map(member => { const line = lines.find(l => l.offerId === member.offerId)!;
                        return { groupTitle: line.offer.groupBuy.title, productName: line.offer.sku.product.name, quantity: line.quantity }; }) })) };
        const createdAt = new Date();
        const checkout = await tx.checkout.create({ data: { customerAccountId, requestId: input.requestId, requestHash,
                customerName: input.customerName, customerPhone: input.customerPhone, delivery,
                bankSnapshot: { bankName: settings!.bankName, bankCode: settings!.bankCode, bankAccount: settings!.bankAccount, accountName: settings!.accountName },
                subtotal: quote.subtotal, shippingAmount: quote.shippingAmount, totalAmount: quote.totalAmount,
                createdAt, expiresAt: new Date(createdAt.getTime() + 6 * 3600000), payment: { create: {} } } });
        for (const group of quote.groups) {
            const f = await tx.fulfillmentGroup.create({ data: { checkoutId: checkout.id, method: input.method, temperature: group.rate.temperature,
                    compatibilityKey: group.key, rateSnapshot: json(group.rate), subtotal: group.subtotal, shippingAmount: group.shippingAmount, waitUntil: group.waitUntil } });
            for (const member of group.lines) {
                const line = lines.find(l => l.offerId === member.offerId)!;
                await tx.checkoutItem.create({ data: { checkoutId: checkout.id, fulfillmentGroupId: f.id, offerId: line.offerId, skuId: line.skuId,
                        groupBuyId: line.groupBuyId, productName: line.offer.sku.product.name,
                        specification: [line.offer.sku.displayName, line.offer.sku.code, ...line.offer.sku.options.map(o => `${o.optionValue.option.name}：${o.optionValue.value}`)].filter(Boolean).join("／"),
                        groupTitle: line.offer.groupBuy.title, unitPrice: line.price, quantity: line.quantity,
                        shippingSnapshot: json({ temperature: line.temperature, methods: line.methods, weightGrams: line.weightGrams, lengthMm: line.lengthMm, widthMm: line.widthMm, heightMm: line.heightMm, note: line.note }) } });
            }
        }
        await changeStock(tx, checkout.id, demands(lines), "RESERVE");
        if (selectionId) {
            const claim = await tx.sevenElevenStoreSelection.updateMany({ where: { id: selectionId, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now, checkoutId: checkout.id } });
            if (claim.count !== 1)
                fail("選店已使用，請重新選店。");
        }
        await audit(tx, checkout.id, "CREATED", { customerAccountId });
        return { id: checkout.id, subtotal: checkout.subtotal, shippingAmount: checkout.shippingAmount, totalAmount: checkout.totalAmount };
    }, { timeout: 15000 });
}
export async function readCheckout(checkoutId: string, ownerId: string) {
    return getDb().checkout.findFirst({ where: { id: id.parse(checkoutId), customerAccountId: id.parse(ownerId) }, include });
}
export async function reportTransfer(checkoutId: string, ownerId: string, lastFive: string, bytes: Uint8Array) {
    id.parse(checkoutId);
    id.parse(ownerId);
    if (!/^\d{5}$/.test(lastFive))
        fail("轉出帳號末五碼必須為五位數字。");
    if (!await getDb().checkout.findFirst({ where: { id: checkoutId, customerAccountId: ownerId }, select: { id: true } }))
        fail("無法存取此購買。");
    const image = await normalizeScreenshot(bytes);
    return getDb().$transaction(async (tx) => {
        await lock(tx, checkoutId);
        const c = await tx.checkout.findFirst({ where: { id: checkoutId, customerAccountId: ownerId }, include: { payment: { include: { bankReport: { select: { lastFive: true, sha256: true } } } } } });
        if (!c?.payment)
            return fail("無法存取此購買。");
        const existing = c.payment.bankReport;
        if (existing) {
            if (existing.lastFive === lastFive && existing.sha256 === image.sha256)
                return;
            return fail("回報已送出；更正請聯絡 LINE 官方客服並由管理員稽核。");
        }
        const now = new Date();
        if (c.status !== "AWAITING_PAYMENT" || c.expiresAt <= now)
            return fail("付款回報已關閉，請聯絡 LINE 官方客服。");
        await tx.bankTransferReport.create({ data: { paymentId: c.payment.id, lastFive, ...image } });
        await tx.payment.update({ where: { id: c.payment.id }, data: { status: "REPORTED", reportedAt: now } });
        await tx.checkout.update({ where: { id: checkoutId }, data: { status: "REPORTED" } });
        await audit(tx, checkoutId, "REPORTED", { customerAccountId: ownerId, reportedAt: now });
        await notify(tx,checkoutId,"TRANSFER_REPORTED",`transfer:${c.payment.id}`,"ADMIN","顧客已回報轉帳，請登入 QBUY 核帳頁查看私有截圖與入帳紀錄。");
    });
}
export async function expireCheckouts(limit = 100) {
    const due = await getDb().checkout.findMany({ where: { status: "AWAITING_PAYMENT", expiresAt: { lte: new Date() } }, take: limit, orderBy: { expiresAt: "asc" }, select: { id: true } });
    let expired = 0;
    for (const c of due)
        expired += await getDb().$transaction(async (tx) => {
            await lock(tx, c.id);
            const current = await tx.checkout.findUniqueOrThrow({ where: { id: c.id }, include: { items: true } });
            if (current.status !== "AWAITING_PAYMENT" || current.expiresAt > new Date())
                return 0;
            await changeStock(tx, c.id, demands(current.items), "RELEASE");
            await tx.checkout.update({ where: { id: c.id }, data: { status: "EXPIRED" } });
            await tx.payment.update({ where: { checkoutId: c.id }, data: { status: "EXPIRED" } });
            await audit(tx, c.id, "EXPIRED", {});
            return 1;
        });
    return expired;
}
export async function recordReceipt(checkoutId: string, actorId: string, raw: unknown) {
    id.parse(checkoutId);
    id.parse(actorId);
    const data = receiptInput.parse(raw);
    if (new Date(data.bankReceivedAt) > new Date())
        fail("銀行入帳時間不能在未來。");
    return getDb().$transaction(async (tx) => {
        await lock(tx, checkoutId);
        const c = await tx.checkout.findUniqueOrThrow({ where: { id: checkoutId }, include: { payment: true } });
        if (!c.payment)
            return fail("付款資料不存在。");
        const previous = await tx.bankReceipt.findUnique({ where: { requestId: data.requestId } });
        if (previous) {
            if (previous.paymentId !== c.payment.id || previous.amount !== data.amount || previous.bankReference !== data.bankReference || previous.actorId !== actorId || previous.bankReceivedAt.toISOString() !== data.bankReceivedAt || previous.note !== data.note)
                fail("入帳操作識別碼已使用。");
            return;
        }
        if (["AWAITING_PAYMENT"].includes(c.status))
            fail("此狀態不能記錄入帳；請先完成回報或例外處理。");
        await tx.bankReceipt.create({ data: { paymentId: c.payment.id, actorId, requestId: data.requestId, bankReference: data.bankReference, amount: data.amount, bankReceivedAt: new Date(data.bankReceivedAt), note: data.note } });
        const total = safeAmount(c.payment.confirmedAmount + data.amount);
        const terminal = c.status === "FINALIZED" || c.status === "REFUND_REQUIRED";
        if (terminal) {
            await tx.payment.update({ where: { id: c.payment.id }, data: { confirmedAmount: total } });
            if (c.status === "FINALIZED") {
                await appendRefund(tx, checkoutId, "OVERPAYMENT", total - c.totalAmount, `receipt:${data.requestId}`);
            }
            else {
                const other = await tx.refundObligation.aggregate({ where: { checkoutId, reason: { not: "UNFULFILLABLE" } }, _sum: { amount: true } });
                const amount = total - (other._sum.amount ?? 0);
                await appendRefund(tx, checkoutId, "UNFULFILLABLE", amount, `receipt:${data.requestId}`);
            }
            await audit(tx, checkoutId, "ADDITIONAL_BANK_RECEIPT", { ...data, total }, actorId);
            return;
        }
        const expired = c.status === "EXPIRED";
        const enough = total >= c.totalAmount;
        await tx.payment.update({ where: { id: c.payment.id }, data: { confirmedAmount: total, confirmedAt: enough ? new Date() : null, status: expired ? "LATE_RECEIPT" : enough ? "RECEIVED" : "ANOMALY", anomalyReason: enough ? null : "金額不符" } });
        await tx.checkout.update({ where: { id: checkoutId }, data: { status: expired ? "EXPIRED" : enough ? "RECEIVED" : "ANOMALY" } });
        await audit(tx, checkoutId, "BANK_RECEIPT", { ...data, total }, actorId);
        if (total > c.totalAmount && !expired)
            await appendRefund(tx, checkoutId, "OVERPAYMENT", total - c.totalAmount, `receipt:${data.requestId}`);
    });
}
export async function finalizeCheckout(checkoutId: string, actorId: string) {
    id.parse(checkoutId);
    id.parse(actorId);
    return getDb().$transaction(async (tx) => {
        await lock(tx, checkoutId);
        const c = await tx.checkout.findUniqueOrThrow({ where: { id: checkoutId }, include });
        if (c.status === "FINALIZED")
            return c.orders;
        if (c.status !== "RECEIVED" || !c.payment?.confirmedAt || c.payment.confirmedAmount < c.totalAmount)
            return fail("尚未完整確認銀行入帳。");
        const groupIds = [...new Set(c.items.map(i => i.groupBuyId))].sort();
        const now = new Date();
        const dateKey = formatTaipeiOrderDate(now);
        const seq = await tx.$queryRaw<{
            lastValue: number;
        }[]> `INSERT INTO "QbNumberSequence" ("dateKey","lastValue") VALUES (${dateKey},${groupIds.length}) ON CONFLICT ("dateKey") DO UPDATE SET "lastValue"="QbNumberSequence"."lastValue"+${groupIds.length} WHERE "QbNumberSequence"."lastValue"+${groupIds.length} <= 9999 RETURNING "lastValue"`;
        if (!seq.length)
            return fail("當日 QB 編號額度已滿；入帳紀錄已保留，請次日重試。");
        const orders = [];
        for (let index = 0; index < groupIds.length; index++) {
            const groupBuyId = groupIds[index];
            const items = c.items.filter(i => i.groupBuyId === groupBuyId);
            // Each fulfillment fee belongs to the lexicographically first group in that shipment.
            const shippingAmount = c.fulfillmentGroups.reduce((sum, g) => sum + ([...new Set(c.items.filter(i => i.fulfillmentGroupId === g.id).map(i => i.groupBuyId))].sort()[0] === groupBuyId ? g.shippingAmount : 0), 0);
            const totalAmount = safeAmount(items.reduce((sum, i) => sum + i.unitPrice * i.quantity - i.discount, 0) + shippingAmount);
            orders.push(await tx.qbOrder.create({ data: { checkoutId, groupBuyId, orderNumber: `QB${dateKey}${String(seq[0].lastValue - groupIds.length + index + 1).padStart(4, "0")}`,
                    itemsSnapshot: json(items), deliverySnapshot: json({ delivery: c.delivery, groups: c.fulfillmentGroups.filter(g => items.some(i => i.fulfillmentGroupId === g.id)), customerName: c.customerName, customerPhone: c.customerPhone }), totalAmount, paidAmount: totalAmount, shippingAmount, createdAt: now } }));
        }
        await changeStock(tx, checkoutId, demands(c.items), "ALLOCATE", actorId);
        await tx.checkout.update({ where: { id: checkoutId }, data: { status: "FINALIZED", finalizedAt: now } });
        await tx.payment.update({ where: { checkoutId }, data: { status: "FINALIZED" } });
        await audit(tx, checkoutId, "FINALIZED", { orders: orders.map(o => o.orderNumber) }, actorId);
        await tx.checkoutOutbox.create({ data: { checkoutId, event: "FINALIZED", payload: { orders: orders.map(o => o.orderNumber) } } });
        return orders;
    }, { timeout: 15000 });
}
export async function flagAnomaly(checkoutId: string, actorId: string, reason: string, note: string) {
    const { z } = await import("zod");
    const { reasons } = await import("./validation");
    id.parse(checkoutId);
    id.parse(actorId);
    z.enum(reasons).parse(reason);
    z.string().trim().min(3).max(500).parse(note);
    await getDb().$transaction(async (tx) => {
        await lock(tx, checkoutId);
        const c = await tx.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
        if (!["REPORTED", "ANOMALY"].includes(c.status))
            return fail("此狀態不能標記付款異常。");
        await tx.checkout.update({ where: { id: checkoutId }, data: { status: "ANOMALY" } });
        await tx.payment.update({ where: { checkoutId }, data: { status: "ANOMALY", anomalyReason: reason, anomalyNote: note } });
        await audit(tx, checkoutId, "ANOMALY", { reason, note }, actorId);
        await notify(tx,checkoutId,"PAYMENT_ANOMALY",`anomaly:${randomUUID()}`,"ADMIN","付款異常，請登入 QBUY 核帳頁處理。");
    });
}
export async function resolveException(checkoutId: string, actorId: string, action: "REFUND" | "REBOOK", note: string) {
    id.parse(checkoutId);
    id.parse(actorId);
    if (note.trim().length < 3 || note.length > 500)
        fail("請填寫處置依據及客服紀錄。");
    await getDb().$transaction(async (tx) => {
        await lock(tx, checkoutId);
        const c = await tx.checkout.findUniqueOrThrow({ where: { id: checkoutId }, include });
        if (c.status === "REFUND_REQUIRED" && action === "REFUND")
            return;
        if (!["EXPIRED", "ANOMALY", "REPORTED", "RECEIVED"].includes(c.status) || !c.payment)
            return fail("此購買不適用例外處置。");
        if (action === "REFUND") {
            if (!c.payment.confirmedAmount)
                return fail("請先記錄已確認入帳款項。");
            if (c.status !== "EXPIRED")
                await changeStock(tx, checkoutId, demands(c.items), "RELEASE", actorId);
            await tx.refundObligation.create({ data: { checkoutId, reason: "UNFULFILLABLE", amount: c.payment.confirmedAmount - c.refunds.reduce((sum, r) => sum + r.amount, 0) } });
            await tx.checkout.update({ where: { id: checkoutId }, data: { status: "REFUND_REQUIRED" } });
            await tx.payment.update({ where: { checkoutId }, data: { status: "REFUND_REQUIRED" } });
        }
        else {
            if (c.status !== "EXPIRED" || c.payment.confirmedAmount < c.totalAmount)
                return fail("補單需逾期且足額入帳。");
            // Revalidate current catalog and shipping conditions. Never resurrect the old reservation.
            for (const productId of [...new Set((await tx.productSku.findMany({ where: { id: { in: c.items.map(i => i.skuId) } } })).map(s => s.productId))].sort())
                await tx.$queryRaw `SELECT id FROM "Product" WHERE id=${productId}::uuid FOR UPDATE`;
            const current = await tx.groupBuySku.findMany({ where: { id: { in: c.items.map(i => i.offerId) } }, include: { groupBuy: true, sku: { include: { product: true, inventory: true } } } });
            const now = new Date();
            const lines = c.items.map(i => {
                const o = current.find(o => o.id === i.offerId);
                if (!o || !o.isActive || !o.sku.isActive || !o.sku.product.isActive || !o.sku.product.skuInventoryEnabled || !o.sku.inventory || o.groupBuy.status !== "PUBLISHED" || o.groupBuy.isArchived || o.groupBuy.startAt > now || o.groupBuy.endAt <= now || o.salePrice !== i.unitPrice || (o.purchaseLimit !== null && i.quantity > o.purchaseLimit))
                    return fail("目前販售條件不符，請記錄退款義務。");
                return { offerId: o.id, groupBuyId: o.groupBuyId, canCombine: o.groupBuy.allowsCombinedShipping, endAt: o.groupBuy.endAt, quantity: i.quantity, price: o.salePrice, temperature: o.sku.temperature, methods: o.sku.shippingMethods, weightGrams: o.sku.weightGrams, lengthMm: o.sku.lengthMm, widthMm: o.sku.widthMm, heightMm: o.sku.heightMm, note: o.sku.shippingNote };
            });
            const method = c.fulfillmentGroups[0].method;
            if (method === "FAMILY_MART") {
                const delivery = c.delivery as Record<string, string>;
                const store = await tx.verifiedPickupStore.findFirst({ where: { id: delivery.storeId, isActive: true } });
                if (!store || store.code !== delivery.storeCode || store.name !== delivery.storeName || store.address !== delivery.address)
                    return fail("門市資料已變更，請記錄退款義務。");
            }
            const quote = shippingQuote(lines, method, await tx.shippingRate.findMany());
            if (quote.totalAmount !== c.totalAmount || quote.groups.length !== c.fulfillmentGroups.length || quote.groups.some(g => !c.fulfillmentGroups.some(old => old.compatibilityKey === g.key && old.waitUntil.getTime() === g.waitUntil.getTime() && old.shippingAmount === g.shippingAmount)))
                return fail("配送條件已變更，請記錄退款義務。");
            await changeStock(tx, checkoutId, demands(c.items), "RESERVE", actorId);
            await tx.checkout.update({ where: { id: checkoutId }, data: { status: "RECEIVED" } });
            await tx.payment.update({ where: { checkoutId }, data: { status: "RECEIVED", confirmedAt: new Date() } });
            if (c.payment.confirmedAmount > c.totalAmount)
                await tx.refundObligation.create({ data: { checkoutId, reason: "OVERPAYMENT", amount: c.payment.confirmedAmount - c.totalAmount } });
        }
        await audit(tx, checkoutId, action, { note }, actorId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
}
