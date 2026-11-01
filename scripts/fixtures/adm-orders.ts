import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { syntheticBankReference } from "../../e2e/lib/reference";
import { validateE2eTargetDatabaseUrl } from "../lib/e2e-database";

validateE2eTargetDatabaseUrl(process.env.DATABASE_URL ?? "");
if (process.env.QBUY_ENV !== "test" || process.env.QBUY_ENABLE_LINE_PUSH !== "false" || process.env.QBUY_ENABLE_LOGISTICS_EXTERNAL !== "false") throw new Error("隔離與外部服務停用設定不完整。");
const file = ".temp/adm-preview/manifest.json";
const m = JSON.parse(await readFile(file, "utf8"));
if (new URL(process.env.DATABASE_URL!).pathname !== `/${m.database}` || m.complete) throw new Error("不允許覆蓋已完成的測試環境。");
const { getDb } = await import("../../src/lib/db");
const db = getDb();
const { createFirstAdmin } = await import("../../src/lib/auth/bootstrap-admin");
const checkout = await import("../../src/lib/checkout/service");
const api = await import("../../src/lib/qbuy/service");
const { mutateCommerce } = await import("../../src/lib/commerce/admin");
const skuApi = await import("../../src/lib/products/sku-service");
const selections = await import("../../src/lib/logistics/store-selection");
try {
  if (await db.checkout.count() || await db.user.count()) throw new Error("測試目標必須為新建空資料庫；失敗後請明確執行 clean 再 seed。");
  const actor = await createFirstAdmin({ email: m.email, password: m.password });
  await db.checkoutSettings.create({ data: { id: "default", bankName: "隔離測試銀行（非真實帳戶）", bankCode: "000", bankAccount: "000000000000", accountName: "QBUY 開發測試", enabled: true } });
  for (const method of ["HOME_DELIVERY", "FAMILY_MART", "SEVEN_ELEVEN"]) for (const temperature of ["AMBIENT", "CHILLED"]) {
    await db.shippingRate.create({ data: { method, temperature, enabled: true, fee: temperature === "CHILLED" ? 100 : 60, freeThreshold: 1000, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000, capabilityEvidence: "隔離測試用配送能力，未連接真實物流" } });
  }
  const store = await db.verifiedPickupStore.create({ data: { code: "QA001", name: "全家開發測試店", address: "測試市測試區虛擬路 1 號（非真實門市）", isActive: true, verificationEvidence: "隔離合成門市，不連接外部服務" } });
  const product = await db.product.create({ data: { name: "【開發測試】超長商品名稱・職人手作暖心分享組合包（多規格／常溫與冷藏配送情境／缺圖測試）", defaultPrice: 280, cost: 100, unit: "盒" } });
  const option = await skuApi.createProductOption(product.id, "口味與保存方式");
  const skus = [];
  for (const [index, name] of ["原味・常溫", "抹茶・冷藏"].entries()) {
    const value = await skuApi.createProductOptionValue(product.id, option.id, name);
    const sku = await skuApi.createProductSku(product.id, { code: `ADM-TEST-${index}`, optionValueIds: [value.id] });
    await mutateCommerce({ operation: "skuEdit", id: sku.id, code: sku.code, displayName: name, isActive: "true", temperature: index ? "CHILLED" : "AMBIENT", shippingMethods: ["HOME_DELIVERY", "FAMILY_MART", "SEVEN_ELEVEN"], weightGrams: 100, lengthMm: 20, widthMm: 20, heightMm: 10, shippingNote: "" }, actor.id);
    await mutateCommerce({ operation: "inventory", skuId: sku.id, requestId: randomUUID(), kind: "INITIAL", value: 500, expectedVersion: 0, reason: "隔離 ADM 測試初始盤點", confirmed: "yes" }, actor.id);
    skus.push(sku);
  }
  const cutOff = new Date(Date.now() + 120000);
  const groups = [];
  for (const [index, title] of ["日常練習團（持續開放）", "物流練習團（兩分鐘後截單）", "合併配送第二團"].entries()) {
    const group = await db.groupBuy.create({ data: { title: `【開發測試】${title}`, slug: `gb-${randomBytes(8).toString("hex")}`, startAt: new Date(Date.now() - 60000), endAt: index === 1 ? cutOff : new Date(Date.now() + 7 * 86400000), allowsSelfPickup: false, allowsSevenEleven: true } });
    const offers = [];
    for (const [n, sku] of skus.entries()) offers.push(await mutateCommerce({ operation: "offer", groupBuyId: group.id, skuId: sku.id, salePrice: 280 + index * 40 + n * 120, purchaseLimit: null, isActive: "true" }, actor.id) as { id: string; salePrice: number });
    await mutateCommerce({ operation: "group", id: group.id, categoryId: null, isFeatured: "false", featuredSort: 0, allowsCombinedShipping: "true", visibility: "PUBLISHED" }, actor.id);
    groups.push({ ...group, offers });
  }
  const scenarios = ["尚未付款", "7-ELEVEN 尚未付款", "顧客已回報轉帳", "全家等待人工核帳", "付款不足", "付款資料異常", "銀行已確認入帳待建單", "已入帳待人工建單", "正式訂單待截單", "一次購買兩筆 QB 訂單", "同一 QB 訂單兩個配送群組", "截單後待建立物流", "已建立物流待交寄", "已交寄", "運送中", "全家到店待取", "已送達", "物流已完成", "取消申請待審核", "取消已核准／待退款", "取消已拒絕", "退款處理中", "已退款", "退款失敗", "物流退回待實收", "已實收退回包裹", "退回品質異常", "重寄待收運費", "已確認重寄運費", "已重寄運送中"];
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff3e6" } }).png().toBuffer();
  const records = [];
  const cmd = () => ({ requestId: randomUUID(), evidence: "隔離測試人工核實證據，非真實交易", confirmed: true });
  for (const [i, scenario] of scenarios.entries()) {
    const shipping = (i >= 11 && i <= 17) || i >= 24;
    const group = groups[shipping ? 1 : 0];
    const owner = await db.customerAccount.create({ data: { lineUserId: `ADM_TEST_${randomUUID()}`, displayName: `測試顧客 ${String(i + 1).padStart(2, "0")}`, lastLoginAt: new Date() } });
    const method = i === 1 ? "SEVEN_ELEVEN" : [3, 15].includes(i) ? "FAMILY_MART" : "HOME_DELIVERY";
    let selectionToken: string | undefined;
    const binding = randomBytes(32).toString("base64url");
    if (method === "SEVEN_ELEVEN") {
      const { state } = await selections.beginSevenElevenStoreSelection(group.slug, binding);
      const pending = await db.sevenElevenStoreSelection.findUniqueOrThrow({ where: { stateHash: createHash("sha256").update(state).digest("base64url") } });
      selectionToken = (await selections.completeSevenElevenStoreSelection({ MerchantID: "TEST001", MerchantTradeNo: pending.merchantTradeNo, LogisticsSubType: "UNIMARTC2C", CVSStoreID: "QA002", CVSStoreName: "測試門市", CVSAddress: "測試市虛擬路二號", ExtraData: state }, { merchantId: "TEST001", resolveStore: async () => ({ id: "QA002", name: "測試門市", address: "測試市虛擬路二號" }) }))?.selectionToken;
      if (!selectionToken) throw new Error("測試選店失敗");
    }
    const chosen = [group.offers[0], ...(i === 9 ? [groups[2].offers[0]] : i === 10 ? [group.offers[1]] : [])];
    const c = await checkout.createCheckout({ requestId: randomUUID(), lines: chosen.map(o => ({ offerId: o.id, quantity: 1, expectedPrice: o.salePrice })), customerName: `測試 ${String(i + 1).padStart(2, "0")}・${scenario}`, customerPhone: `09000000${String(i + 1).padStart(2, "0")}`, method, address: "測試市測試區虛擬路 99 號（非真實收件資料）", ...(method === "FAMILY_MART" ? { familyStoreId: store.id } : {}), ...(selectionToken ? { selectionToken } : {}) }, owner.id, binding);
    const id = c.id!;
    if (i >= 2) await checkout.reportTransfer(id, owner.id, "00001", image);
    if (i === 4) await checkout.recordReceipt(id, actor.id, { requestId: randomUUID(), bankReference: syntheticBankReference(), amount: 50, bankReceivedAt: new Date(Date.now() - 1000).toISOString(), note: "隔離測試付款不足", confirmed: true });
    if (i === 5) await checkout.flagAnomaly(id, actor.id, "截圖不清", "隔離測試，請顧客確認資料");
    if (i >= 6) await checkout.recordReceipt(id, actor.id, { requestId: randomUUID(), bankReference: syntheticBankReference(), amount: c.totalAmount, bankReceivedAt: new Date(Date.now() - 1000).toISOString(), note: "隔離測試銀行入帳，無真實款項", confirmed: true });
    if (i >= 8) await checkout.finalizeCheckout(id, actor.id);
    if (i >= 18 && i <= 23) {
      const order = await db.qbOrder.findFirstOrThrow({ where: { checkoutId: id } });
      const r = await api.submitCancellation(owner.id, { requestId: randomUUID(), orderId: order.id, reason: "不需要", note: "隔離取消情境" });
      if (i >= 19) await api.reviewCancellation(actor.id, r.id, i !== 20, "隔離測試人工審核說明");
      if (i >= 21) {
        const refund = await db.refundObligation.findFirstOrThrow({ where: { checkoutId: id } });
        const input = { ...cmd(), refundId: refund.id, amount: refund.amount, bankReference: syntheticBankReference(), secondConfirmation: false };
        await api.processRefund(actor.id, { ...input, status: "PROCESSING" });
        if (i === 22 || i === 23) await api.processRefund(actor.id, { ...input, requestId: randomUUID(), status: i === 22 ? "REFUNDED" : "ERROR", secondConfirmation: i === 22 });
      }
    }
    records.push({ index: i, scenario, checkoutId: id, shipping });
    console.log(`已建立 ${i + 1}/30：${scenario}`);
  }
  // Use the real clock; no direct status changes, backdating, fake timers or external requests.
  while (Date.now() <= cutOff.getTime()) { console.log(`等待測試團購合法截單（約 ${Math.ceil((cutOff.getTime() - Date.now()) / 1000)} 秒）`); await new Promise(r => setTimeout(r, Math.min(15000, cutOff.getTime() - Date.now() + 100))); }
  for (const record of records.filter(r => r.shipping && r.index !== 11)) {
    const i = record.index;
    const group = await db.fulfillmentGroup.findFirstOrThrow({ where: { checkoutId: record.checkoutId } });
    const shipment = await api.createShipment(actor.id, { ...cmd(), groupId: group.id, trackingNumber: `QA-${randomUUID()}` });
    const event = (status: string, shipmentId = shipment.id) => api.shipmentEvent(actor.id, { ...cmd(), shipmentId, status });
    if (i >= 13) await event("SHIPPED");
    if ([14, 15, 16, 17].includes(i)) await event("IN_TRANSIT");
    if (i === 15) await event("READY");
    if ([16, 17].includes(i)) await event("DELIVERED");
    if (i === 17) await event("COMPLETED");
    if (i >= 24) {
      await event("RETURNED");
      if (i >= 25) {
        const returned = await api.receiveReturn(actor.id, shipment.id, cmd());
        if (i >= 26) await api.inspectReturn(actor.id, { ...cmd(), returnId: returned.id, quality: i === 26 ? "FAIL" : "PASS", quantity: 1, responsibility: "CUSTOMER", method: "HOME_DELIVERY", address: "測試市虛擬路重寄地址 2 號", waiveFee: false });
        if (i >= 28) await api.payResendFee(actor.id, returned.id, 60, syntheticBankReference(), "隔離測試重寄費用已核實");
        if (i === 29) { const next = await api.createShipment(actor.id, { ...cmd(), groupId: group.id, returnId: returned.id, trackingNumber: `QA-RESEND-${randomUUID()}` }); await event("SHIPPED", next.id); await event("IN_TRANSIT", next.id); }
      }
    }
    console.log(`物流情境完成：${record.scenario}`);
  }
  m.complete = true; m.scenarios = records;
  await writeFile(file, JSON.stringify(m, null, 2), { mode: 0o600 });
  console.log(`完成：${await db.checkout.count()} 筆購買、${await db.qbOrder.count()} 筆正式訂單、${await db.fulfillmentGroup.count()} 個配送群組。外部推播與物流停用。`);
} finally { await db.$disconnect(); }
