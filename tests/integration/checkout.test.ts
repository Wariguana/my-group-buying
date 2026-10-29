// @vitest-environment node
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { beforeAll, afterAll, describe, test, expect, vi } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";
vi.mock("server-only", () => ({}));
const enabled = process.env.SKU_INTEGRATION_TEST === "1";
if (enabled)
    validateE2eTargetDatabaseUrl(process.env.DATABASE_URL!);
(enabled ? describe : describe.skip)("Checkout PostgreSQL transactions", () => {
    let db: ReturnType<typeof import("@/lib/db")["getDb"]>;
    let api: typeof import("@/lib/checkout/service");
    let actor: string;
    let image: Buffer;
    beforeAll(async () => {
        db = (await import("@/lib/db")).getDb();
        api = await import("@/lib/checkout/service");
        actor = (await db.user.create({ data: { email: `${randomUUID()}@checkout.invalid`, passwordHash: "fixture" } })).id;
        image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
        await db.checkoutSettings.create({ data: { id: "default", bankName: "測試銀行", bankCode: "000", bankAccount: "00000000", accountName: "隔離測試", enabled: true } });
        await db.shippingRate.create({ data: { method: "HOME_DELIVERY", temperature: "AMBIENT", enabled: true, fee: 60, freeThreshold: 500, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000, capabilityEvidence: "isolated simulation" } });
    });
    afterAll(async () => { await db?.$disconnect(); });
    async function fixture(stock = 20, groups = 3) {
        const product = await db.product.create({ data: { name: "Checkout 商品", defaultPrice: 100, cost: 50, unit: "件", skuInventoryEnabled: true } });
        const sku = await db.productSku.create({ data: { id: product.id, productId: product.id, code: `DEFAULT-${product.id.toUpperCase()}`, combinationKey: "default", shippingMethods: ["HOME_DELIVERY"], weightGrams: 100, lengthMm: 10, widthMm: 10, heightMm: 10, inventory: { create: { onHand: stock } } } });
        const offers = [];
        for (let i = 0; i < groups; i++) {
            const group = await db.groupBuy.create({ data: { title: `團 ${i}`, slug: randomUUID(), status: "PUBLISHED", startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 3600000 * (i + 1)), allowsCombinedShipping: i < 2 } });
            offers.push(await db.groupBuySku.create({ data: { groupBuyId: group.id, skuId: sku.id, salePrice: 100 } }));
        }
        const owner = (await db.customerAccount.create({ data: { lineUserId: randomUUID(), lastLoginAt: new Date() } })).id;
        const input = { requestId: randomUUID(), lines: offers.map(o => ({ offerId: o.id, quantity: 1, expectedPrice: o.salePrice })), customerName: "測試顧客", customerPhone: "0912345678", method: "HOME_DELIVERY", address: "台北市測試區測試路 1 號" };
        return { sku, offers, owner, input };
    }
    async function reported(f: Awaited<ReturnType<typeof fixture>>) { const c = await api.createCheckout(f.input, f.owner); await api.reportTransfer(c.id!, f.owner, "12345", image); return c.id!; }
    async function receipt(checkoutId: string, amount: number) { return api.recordReceipt(checkoutId, actor, { requestId: randomUUID(), bankReference: randomUUID(), amount, bankReceivedAt: new Date(Date.now() - 1000).toISOString(), note: "模擬銀行已入帳", confirmed: true }); }
    test("three groups aggregate one SKU, independent freight, six hours and idempotency", async () => {
        const f = await fixture();
        const started = Date.now();
        const c = await api.createCheckout(f.input, f.owner);
        const again = await api.createCheckout(f.input, f.owner);
        expect(again.id).toBe(c.id);
        const stored = await api.readCheckout(c.id!, f.owner);
        expect(stored?.items).toHaveLength(3);
        expect(stored?.fulfillmentGroups).toHaveLength(2);
        expect(stored?.totalAmount).toBe(420);
        expect(stored!.expiresAt.getTime() - started).toBeGreaterThanOrEqual(6 * 3600000);
        expect(await db.skuInventory.findUnique({ where: { skuId: f.sku.id } })).toMatchObject({ onHand: 20, reserved: 3, allocated: 0 });
        await expect(api.createCheckout({ ...f.input, customerName: "different" }, f.owner)).rejects.toThrow();
    });
    test("two checkouts competing for final item only reserve one", async () => {
        const f = await fixture(1, 1);
        const owner = (await db.customerAccount.create({ data: { lineUserId: randomUUID(), lastLoginAt: new Date() } })).id;
        const results = await Promise.allSettled([api.createCheckout(f.input, f.owner), api.createCheckout({ ...f.input, requestId: randomUUID() }, owner)]);
        expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
        expect(await db.skuInventory.findUnique({ where: { skuId: f.sku.id } })).toMatchObject({ onHand: 1, reserved: 1 });
    });
    test("quote exposes complete per-group freight without internal rate evidence or reservations", async () => {
        const f = await fixture();
        const quote = await api.createCheckout(f.input, f.owner, "", true);
        expect(quote.id).toBeNull();
        expect(quote.groups).toHaveLength(2);
        expect(quote.groups!.map(g => g.shippingAmount)).toEqual([60, 60]);
        expect(quote.groups!.reduce((n, g) => n + g.subtotal + g.shippingAmount, 0)).toBe(quote.totalAmount);
        expect(quote.groups!.flatMap(g => g.items)).toHaveLength(3);
        expect(JSON.stringify(quote)).not.toContain("capabilityEvidence");
        expect(JSON.stringify(quote)).not.toContain("isolated simulation");
        expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(0);
        expect(await db.checkout.count({ where: { customerAccountId: f.owner } })).toBe(0);
    });
    test("same SKU across groups cannot claim the same last item", async () => { const f = await fixture(1, 2); await expect(api.createCheckout(f.input, f.owner)).rejects.toThrow(); expect(await db.checkout.count({ where: { customerAccountId: f.owner } })).toBe(0); });
    test("multi SKU failure rolls back all reservations", async () => { const a = await fixture(2, 1); const b = await fixture(0, 1); await expect(api.createCheckout({ ...a.input, lines: [...a.input.lines, ...b.input.lines] }, a.owner)).rejects.toThrow(); expect(await db.skuInventory.findUnique({ where: { skuId: a.sku.id } })).toMatchObject({ reserved: 0 }); });
    test("concurrent request replay reserves only once", async () => { const f = await fixture(5, 1); const results = await Promise.all([api.createCheckout(f.input, f.owner), api.createCheckout(f.input, f.owner)]); expect(results[0].id).toBe(results[1].id); expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(1); });
    test("expired report and worker race cannot report and release", async () => {
        const f = await fixture(5, 1);
        const c = await api.createCheckout(f.input, f.owner);
        await db.checkout.update({ where: { id: c.id! }, data: { expiresAt: new Date(Date.now() - 1) } });
        const results = await Promise.allSettled([api.reportTransfer(c.id!, f.owner, "12345", image), api.expireCheckouts()]);
        expect(results[0].status).toBe("rejected");
        expect((await api.readCheckout(c.id!, f.owner))?.status).toBe("EXPIRED");
        expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(0);
        expect(await api.expireCheckouts()).toBe(0);
    });
    test("reported and anomaly rows survive expiry worker", async () => { const f = await fixture(); const c = await reported(f); await db.checkout.update({ where: { id: c }, data: { expiresAt: new Date(0) } }); await api.expireCheckouts(); await api.flagAnomaly(c, actor, "截圖不清", "請洽客服確認"); await api.expireCheckouts(); expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(3); });
    test("two admins finalizing create all three QB orders once and allocate once", async () => {
        const f = await fixture();
        const c = await reported(f);
        await receipt(c, 420);
        const other = (await db.user.create({ data: { email: `${randomUUID()}@checkout.invalid`, passwordHash: "fixture" } })).id;
        const results = await Promise.all([api.finalizeCheckout(c, actor), api.finalizeCheckout(c, other)]);
        expect(results[0].map(o => o.id)).toEqual(results[1].map(o => o.id));
        expect(results[0]).toHaveLength(3);
        expect(new Set(results[0].map(o => o.orderNumber)).size).toBe(3);
        expect(results[0].every(o => /^QB\d{12}$/.test(o.orderNumber))).toBe(true);
        expect(results[0].reduce((n, o) => n + o.totalAmount, 0)).toBe(420);
        expect(await db.skuInventory.findUnique({ where: { skuId: f.sku.id } })).toMatchObject({ onHand: 20, reserved: 0, allocated: 3 });
        expect(await db.inventoryMovement.count({ where: { checkoutId: c, kind: "ALLOCATE" } })).toBe(1);
    });
    test("finalization mid-transaction failure preserves bank receipts and safely retries", async () => {
        const f = await fixture();
        const c = await reported(f);
        await receipt(c, 420);
        await db.$executeRawUnsafe(`CREATE FUNCTION checkout_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."checkoutId" = '${c}'::uuid THEN RAISE EXCEPTION 'injected finalization failure'; END IF; RETURN NEW; END; $$`);
        await db.$executeRawUnsafe('CREATE TRIGGER checkout_test_failure BEFORE INSERT ON "CheckoutOutbox" FOR EACH ROW EXECUTE FUNCTION checkout_test_failure()');
        try {
            await expect(api.finalizeCheckout(c, actor)).rejects.toThrow();
            expect(await db.qbOrder.count({ where: { checkoutId: c } })).toBe(0);
            expect((await api.readCheckout(c, f.owner))?.payment?.confirmedAmount).toBe(420);
            expect((await api.readCheckout(c, f.owner))?.status).toBe("RECEIVED");
            expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(3);
        }
        finally {
            await db.$executeRawUnsafe('DROP TRIGGER checkout_test_failure ON "CheckoutOutbox"');
            await db.$executeRawUnsafe('DROP FUNCTION checkout_test_failure()');
        }
        expect(await api.finalizeCheckout(c, actor)).toHaveLength(3);
    });
    test("daily capacity refuses partial orders and rolls back sequence", async () => {
        const f = await fixture();
        const c = await reported(f);
        await receipt(c, 420);
        const { formatTaipeiOrderDate } = await import("@/lib/orders/order-number");
        const dateKey = formatTaipeiOrderDate(new Date());
        const previous = await db.qbNumberSequence.findUnique({ where: { dateKey } });
        await db.qbNumberSequence.upsert({ where: { dateKey }, create: { dateKey, lastValue: 9998 }, update: { lastValue: 9998 } });
        try {
            await expect(api.finalizeCheckout(c, actor)).rejects.toThrow("額度");
            expect(await db.qbOrder.count({ where: { checkoutId: c } })).toBe(0);
            expect((await db.qbNumberSequence.findUniqueOrThrow({ where: { dateKey } })).lastValue).toBe(9998);
        }
        finally {
            await db.qbNumberSequence.update({ where: { dateKey }, data: { lastValue: previous?.lastValue ?? 1 } });
        }
    });
    test("ownership rejects reads and image report for another customer", async () => { const f = await fixture(); const c = await api.createCheckout(f.input, f.owner); expect(await api.readCheckout(c.id!, randomUUID())).toBeNull(); await expect(api.reportTransfer(c.id!, randomUUID(), "12345", image)).rejects.toThrow(); });
    test("private report requires valid content and last five, immutable on resubmit", async () => {
        const f = await fixture();
        const c = await api.createCheckout(f.input, f.owner);
        await expect(api.reportTransfer(c.id!, f.owner, "1234", image)).rejects.toThrow();
        await expect(api.reportTransfer(c.id!, f.owner, "12345", Buffer.from("fake png"))).rejects.toThrow();
        await expect(api.reportTransfer(c.id!, f.owner, "12345", Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow();
        await api.reportTransfer(c.id!, f.owner, "12345", image);
        await api.reportTransfer(c.id!, f.owner, "12345", image);
        await expect(api.reportTransfer(c.id!, f.owner, "54321", image)).rejects.toThrow();
    });
    test("tampered amounts and stale prices are rejected", async () => { const f = await fixture(); await expect(api.createCheckout({ ...f.input, totalAmount: 1 }, f.owner)).rejects.toThrow(); await expect(api.createCheckout({ ...f.input, shippingAmount: 0 }, f.owner)).rejects.toThrow(); await expect(api.createCheckout({ ...f.input, lines: f.input.lines.map(i => ({ ...i, expectedPrice: 1 })) }, f.owner)).rejects.toThrow(); });
    test("incompatible temperature and unsupported shipping reject", async () => { const f = await fixture(); await db.productSku.update({ where: { id: f.sku.id }, data: { temperature: "FROZEN" } }); await expect(api.createCheckout(f.input, f.owner)).rejects.toThrow(); await expect(api.createCheckout({ ...f.input, method: "FAMILY_MART" }, f.owner)).rejects.toThrow(); });
    test("partial receipts, top-up and overpayment reconcile without store credit", async () => { const f = await fixture(); const c = await reported(f); await receipt(c, 100); expect((await api.readCheckout(c, f.owner))?.status).toBe("ANOMALY"); await expect(api.finalizeCheckout(c, actor)).rejects.toThrow(); await receipt(c, 350); expect((await api.readCheckout(c, f.owner))?.refunds[0].amount).toBe(30); await api.finalizeCheckout(c, actor); expect((await api.readCheckout(c, f.owner))?.orders.reduce((n, o) => n + o.paidAmount, 0)).toBe(420); });
    test("late receipts are preserved, unavailable stock leads to refund obligation", async () => { const f = await fixture(1, 1); const c = await api.createCheckout(f.input, f.owner); await db.checkout.update({ where: { id: c.id! }, data: { expiresAt: new Date(0) } }); await api.expireCheckouts(); await receipt(c.id!, 160); await db.productSku.update({ where: { id: f.sku.id }, data: { isActive: false } }); await expect(api.resolveException(c.id!, actor, "REBOOK", "模擬補單處置")).rejects.toThrow(); await api.resolveException(c.id!, actor, "REFUND", "無法履約記錄退款"); expect((await api.readCheckout(c.id!, f.owner))?.refunds[0].amount).toBe(160); });
    test("late receipt rebooking revalidates and acquires a new reservation", async () => { const f = await fixture(1, 1); const c = await api.createCheckout(f.input, f.owner); await db.checkout.update({ where: { id: c.id! }, data: { expiresAt: new Date(0) } }); await api.expireCheckouts(); await receipt(c.id!, 160); await api.resolveException(c.id!, actor, "REBOOK", "重新查核庫存販售"); await api.finalizeCheckout(c.id!, actor); expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).allocated).toBe(1); });
    test("group closing after checkout does not shorten six-hour payment window", async () => { const f = await fixture(2, 1); const c = await api.createCheckout(f.input, f.owner); await db.groupBuy.update({ where: { id: f.offers[0].groupBuyId }, data: { endAt: new Date(0) } }); await api.reportTransfer(c.id!, f.owner, "12345", image); expect((await api.readCheckout(c.id!, f.owner))?.status).toBe("REPORTED"); });
    test("refunding a confirmed overpayment does not double-count existing obligation", async () => { const f = await fixture(); const c = await reported(f); await receipt(c, 450); await api.resolveException(c, actor, "REFUND", "查核無法履約退款"); expect((await api.readCheckout(c, f.owner))?.refunds.reduce((sum, r) => sum + r.amount, 0)).toBe(450); });
    test("quote comparison refuses silently changed shipping fees", async () => {
        const f = await fixture();
        const q = await api.createCheckout(f.input, f.owner, "", true);
        await db.shippingRate.update({ where: { method_temperature: { method: "HOME_DELIVERY", temperature: "AMBIENT" } }, data: { fee: 61 } });
        try {
            await expect(api.createCheckout({ ...f.input, quoteFingerprint: q.quoteFingerprint }, f.owner)).rejects.toThrow("報價已變更");
        }
        finally {
            await db.shippingRate.update({ where: { method_temperature: { method: "HOME_DELIVERY", temperature: "AMBIENT" } }, data: { fee: 60 } });
        }
    });
    test("FamilyMart uses only active Admin-verified store snapshots", async () => {
        const f = await fixture(5, 1);
        await db.productSku.update({ where: { id: f.sku.id }, data: { shippingMethods: ["FAMILY_MART"] } });
        await db.shippingRate.upsert({ where: { method_temperature: { method: "FAMILY_MART", temperature: "AMBIENT" } }, create: { method: "FAMILY_MART", temperature: "AMBIENT", enabled: true, fee: 65, freeThreshold: null, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000, capabilityEvidence: "isolated simulation" }, update: {} });
        const store = await db.verifiedPickupStore.create({ data: { code: randomUUID().slice(0, 8), name: "模擬全家門市", address: "台北市隔離測試門市地址", isActive: true, verificationEvidence: "isolated manual store verification" } });
        const c = await api.createCheckout({ ...f.input, method: "FAMILY_MART", familyStoreId: store.id }, f.owner);
        expect((await api.readCheckout(c.id!, f.owner))?.delivery).toMatchObject({ method: "FAMILY_MART", storeId: store.id, storeName: store.name, address: store.address });
        await db.verifiedPickupStore.update({ where: { id: store.id }, data: { isActive: false } });
        await expect(api.createCheckout({ ...f.input, requestId: randomUUID(), method: "FAMILY_MART", familyStoreId: store.id }, f.owner)).rejects.toThrow("未核實");
    });
    test("7-ELEVEN retains browser binding and one-time verified selection", async () => {
        const { randomBytes, createHash } = await import("node:crypto");
        const f = await fixture(5, 1);
        await db.productSku.update({ where: { id: f.sku.id }, data: { shippingMethods: ["SEVEN_ELEVEN"] } });
        await db.groupBuy.update({ where: { id: f.offers[0].groupBuyId }, data: { allowsSevenEleven: true } });
        await db.shippingRate.create({ data: { method: "SEVEN_ELEVEN", temperature: "AMBIENT", enabled: true, fee: 60, freeThreshold: null, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000, capabilityEvidence: "isolated simulation" } });
        const token = randomBytes(32).toString("base64url"), binding = randomBytes(32).toString("base64url");
        const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
        await db.sevenElevenStoreSelection.create({ data: { stateHash: hash(randomUUID()), merchantTradeNo: randomBytes(10).toString("hex"), selectionTokenHash: hash(token), browserBindingHash: hash(binding), groupBuyId: f.offers[0].groupBuyId, expiresAt: new Date(Date.now() + 60000), storeId: "123456", storeName: "測試門市", storeAddress: "台北市隔離測試地址" } });
        const input = { ...f.input, method: "SEVEN_ELEVEN", selectionToken: token };
        await expect(api.createCheckout(input, f.owner, "wrong-binding")).rejects.toThrow("選店");
        const c = await api.createCheckout(input, f.owner, binding);
        expect((await api.readCheckout(c.id!, f.owner))?.delivery).toMatchObject({ storeId: "123456" });
        await expect(api.createCheckout({ ...input, requestId: randomUUID() }, f.owner, binding)).rejects.toThrow("選店");
    });
    test("additional bank receipt after finalization retains orders and records full refund liability", async () => { const f = await fixture(); const c = await reported(f); await receipt(c, 420); await api.finalizeCheckout(c, actor); await receipt(c, 420); const result = await api.readCheckout(c, f.owner); expect(result?.status).toBe("FINALIZED"); expect(result?.orders).toHaveLength(3); expect(result?.payment?.confirmedAmount).toBe(840); expect(result?.refunds.reduce((sum, r) => sum + r.amount, 0)).toBe(420); expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).allocated).toBe(3); });
    test("additional receipt after refund disposition increases liability without reacquiring stock", async () => { const f = await fixture(); const c = await reported(f); await receipt(c, 100); await api.resolveException(c, actor, "REFUND", "無法履約記錄退款"); await receipt(c, 50); const result = await api.readCheckout(c, f.owner); expect(result?.status).toBe("REFUND_REQUIRED"); expect(result?.refunds.reduce((sum, r) => sum + r.amount, 0)).toBe(150); expect((await db.skuInventory.findUniqueOrThrow({ where: { skuId: f.sku.id } })).reserved).toBe(0); });
});
