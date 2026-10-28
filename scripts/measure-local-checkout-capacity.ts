import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { E2eDatabaseLifecycle, deriveE2eControlDatabaseUrl } from "./lib/e2e-database";

// No source data is copied. Only a generated sibling database is migrated and written.
let stage = "source-validation";
async function main() {
  if (process.argv.length !== 2 || !process.env.DATABASE_URL) throw new Error("APPROVED_LOCAL_SOURCE_REQUIRED");
  const source = process.env.DATABASE_URL;
  const lifecycle = new E2eDatabaseLifecycle(source);
  const control = new Client({ connectionString: deriveE2eControlDatabaseUrl(source) });
  let db: ReturnType<typeof import("../src/lib/db")["getDb"]> | undefined;
  await control.connect();
  try {
    stage = "create-isolated-database";
    await lifecycle.createDatabase(control);
    stage = "migrate";
    const migrated = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: lifecycle.targetDatabaseUrl }, stdio: "ignore", windowsHide: true,
    });
    if (migrated.status !== 0) throw new Error("ISOLATED_MIGRATION_FAILED");
    process.env.DATABASE_URL = lifecycle.targetDatabaseUrl;
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.QBUY_ENV = "test";
    for (const name of ["CHECKOUT", "BANK_DETAILS", "HOME_DELIVERY"]) process.env[`QBUY_ENABLE_${name}`] = "true";
    process.env.QBUY_ENABLE_LINE_PUSH = "false";
    process.env.QBUY_ENABLE_LOGISTICS_EXTERNAL = "false";
    stage = "load-service";
    db = (await import("../src/lib/db")).getDb();
    const { createCheckout } = await import("../src/lib/checkout/service");
    stage = "synthetic-fixture";
    await db.checkoutSettings.create({ data: { id: "default", bankName: "Synthetic", bankCode: "000", bankAccount: "00000000", accountName: "Synthetic", enabled: true } });
    await db.shippingRate.create({ data: { method: "HOME_DELIVERY", temperature: "AMBIENT", enabled: true, fee: 60, freeThreshold: 500, maxWeightGrams: 100000, maxLengthMm: 1000, maxWidthMm: 1000, maxHeightMm: 1000, capabilityEvidence: "Synthetic local capacity only" } });
    const product = await db.product.create({ data: { name: "Synthetic capacity product", defaultPrice: 100, cost: 1, unit: "件", skuInventoryEnabled: true } });
    await db.productSku.create({ data: { id: product.id, productId: product.id, code: `DEFAULT-${product.id.toUpperCase()}`, combinationKey: "default", shippingMethods: ["HOME_DELIVERY"], weightGrams: 10, lengthMm: 10, widthMm: 10, heightMm: 10, inventory: { create: { onHand: 100 } } } });
    const group = await db.groupBuy.create({ data: { title: "Synthetic capacity group", slug: randomUUID(), status: "PUBLISHED", startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 3600000) } });
    const offer = await db.groupBuySku.create({ data: { groupBuyId: group.id, skuId: product.id, salePrice: 100 } });
    const results = [];
    let completed = 0;
    for (const concurrency of [1, 5, 10]) {
      const durations: number[] = [];
      const customers = Array.from({ length: concurrency * 4 }, () => ({ id: randomUUID(), lineUserId: randomUUID(), lastLoginAt: new Date() }));
      await db.customerAccount.createMany({ data: customers });
      const started = performance.now();
      for (let wave = 0; wave < 4; wave++) {
        await Promise.all(customers.slice(wave * concurrency, (wave + 1) * concurrency).map(async customer => {
          const input = { requestId: randomUUID(), lines: [{ offerId: offer.id, quantity: 1, expectedPrice: 100 }], customerName: "Synthetic", customerPhone: "0900000000", method: "HOME_DELIVERY", address: "台北市合成測試路 1 號" };
          const at = performance.now();
          stage = "quote";
          const quote = await createCheckout(input, customer.id, "", true);
          stage = "create-checkout";
          const checkout = await createCheckout({ ...input, quoteFingerprint: quote.quoteFingerprint }, customer.id);
          if (!checkout.id || checkout.totalAmount !== 160) throw new Error("CAPACITY_TRANSACTION_MISMATCH");
          durations.push(performance.now() - at);
          completed++;
        }));
      }
      const elapsedMs = performance.now() - started;
      durations.sort((a, b) => a - b);
      results.push({ concurrency, completed: durations.length, elapsedMs: Math.round(elapsedMs), p50Ms: Math.round(durations[Math.ceil(durations.length * .5) - 1]), p95Ms: Math.round(durations[Math.ceil(durations.length * .95) - 1]), transactionsPerSecond: Number((durations.length / elapsedMs * 1000).toFixed(2)) });
    }
    stage = "verify-balances";
    const balance = await db.skuInventory.findUniqueOrThrow({ where: { skuId: product.id } });
    if (balance.onHand !== 100 || balance.reserved !== completed || balance.allocated !== 0 || await db.checkout.count() !== completed || await db.qbOrder.count() !== 0) throw new Error("CAPACITY_BALANCE_MISMATCH");
    console.log(JSON.stringify({ result: "PASSED", scope: "Local Node service + isolated PostgreSQL quote/create; excludes HTTP, rendering, cloud latency and external services", results, balance: { onHand: balance.onHand, reserved: balance.reserved, allocated: balance.allocated }, peakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024) }, null, 2));
  } finally {
    await db?.$disconnect();
    if (lifecycle.canDropDatabase(lifecycle.targetDatabaseName)) await lifecycle.dropDatabase(control);
    await control.end();
  }
}
try { await main(); }
catch (error) { console.error(JSON.stringify({ result: "FAILED", stage, errorKind: error instanceof Error ? error.name : "Unknown" })); process.exitCode = 1; }
