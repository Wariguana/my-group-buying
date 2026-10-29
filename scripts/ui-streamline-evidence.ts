import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

async function files(directory: string): Promise<string[]> {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}

const lastRun = JSON.parse(await readFile("test-results/.last-run.json", "utf8"));
if (lastRun.status !== "passed") throw new Error("Refusing to publish evidence from a failed Playwright run.");
const inventory = JSON.parse(await readFile("docs/ux-audit/inventory.json", "utf8"));
const sourceFiles = (await files("src")).map(file => file.replaceAll("\\", "/")).filter(file => /\.[jt]sx?$/.test(file) && !file.startsWith("src/generated/")).sort((a, b) => a.localeCompare(b));
const sourceDigest = createHash("sha256").update((await Promise.all(sourceFiles.map(async file => `${file}\n${await readFile(file, "utf8")}`))).join("\n")).digest("hex");
if (sourceDigest !== inventory.sourceDigest) throw new Error("Source inventory is stale; regenerate and rerun verification.");

const results = await files("test-results");
type Observation = { route: string; state: string; width: number; geometry?: { scroll: number }; scrollWidth?: number; unnamed?: unknown[]; contrast?: unknown[] };
const observations: Observation[] = [];
for (const name of ["route-results.json", "empty-results.json", "catalog-results.json", "product-state-results.json", "loading-results.json", "error-results.json"]) {
  const file = results.find(file => path.basename(file) === name);
  if (!file) throw new Error(`Missing ${name}`);
  const data = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(data) && data.sourceDigest !== sourceDigest) throw new Error(`Stale ${name}`);
  if (data.errors?.length) throw new Error(`Browser errors in ${name}`);
  observations.push(...(Array.isArray(data) ? data : data.records));
}
for (const row of observations) if ((row.geometry?.scroll ?? row.scrollWidth ?? row.width) > row.width || row.unnamed?.length || row.contrast?.length) throw new Error(`Unresolved geometry/accessibility issue on ${row.route}`);
const pages = inventory.routes.filter((route: { kind: string }) => route.kind === "page") as { route: string }[];
for (const page of pages) for (const width of [320, 390, 768, 1024, 1440]) if (!observations.some(row => row.route === page.route && row.state === "normal" && row.width === width)) throw new Error(`Missing normal verification: ${page.route} at ${width}`);
const monitoringFile = results.find(file => path.basename(file) === "monitoring-state-results.json");
if (!monitoringFile) throw new Error("Missing monitoring recovery verification");
const monitoring = JSON.parse(await readFile(monitoringFile, "utf8"));
if (!monitoring.some((row: { state: string }) => row.state === "read-failure")) throw new Error("Read-failure recovery was not completed");

const destination = "docs/ui-streamline/evidence";
const assets: { file: string; sha256: string; bytes: number }[] = [];
// Full runtime JSON plus fixed phone/desktop screenshots. Other widths remain
// reproducible in test-results; this avoids committing duplicate large PNG sets.
for (const file of results.filter(file => /\.json$/.test(file) && path.basename(file) !== ".last-run.json" || /-(390|1440)\.png$/.test(file))) {
  const relative = path.relative("test-results", file).replaceAll("\\", "/");
  const output = path.join(destination, relative);
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(file, output);
  const content = await readFile(file);
  assets.push({ file: relative, sha256: createHash("sha256").update(content).digest("hex"), bytes: content.length });
}
await writeFile(`${destination}/index.json`, JSON.stringify({ sourceDigest, runStatus: lastRun.status, generatedAt: new Date().toISOString(), pages: pages.length, handlers: inventory.routes.length - pages.length, sourceInteractions: inventory.interactions.length, observations: observations.length, monitoring, screenshots: assets.filter(asset => asset.file.endsWith(".png")).length, assets }, null, 2) + "\n");
const screens = [
  ["商城首頁：空資料", "empty--"], ["商城首頁：有商品", "page-home"],
  ["商品詳情", "page--group-buys-slug-"], ["空購物車", "empty--cart"], ["有商品購物車", "cart-with-items"],
  ["Checkout 與各運費群組", "checkout-shipping-groups"], ["銀行轉帳回報", "bank-transfer-report-form"],
  ["我的訂單", "my-orders"], ["取消退款與配送", "customer-refund-delivery"],
  ["營運首頁", "-admin"], ["監控：正常", "monitoring-normal"], ["監控：異常", "monitoring-anomaly"],
  ["監控：Worker 失聯", "monitoring-stale"], ["商品與 SKU／庫存", "admin-sku-inventory"],
  ["開團管理", "page--admin-group-buys"], ["分類管理", "page--admin-commerce"],
  ["銀行核帳", "admin-bank-reconciliation"], ["QB 取消退款", "admin-qb-cancellation"], ["物流與重寄", "admin-return-resend-history"],
  ["監控：讀取失敗／未知", "monitoring-read-failure"], ["完整技術診斷", "monitoring-diagnostics"],
] as const;
function screenshot(prefix: string, width: number) {
  const asset = assets.find(asset => path.basename(asset.file) === `${prefix}-${width}.png`);
  if (!asset) throw new Error(`Missing required screenshot ${prefix} at ${width}`);
  return `evidence/${asset.file}`;
}
await writeFile("docs/ui-streamline/screenshots.md", `# 固定畫面驗收\n\n同一輪通過的隔離資料測試；沒有修改前截圖或捏造比較。下列每張手機及桌面 PNG 的 SHA256 均列在 [完整索引](evidence/index.json)。點擊可檢視原圖；正常監控預設收合，技術診斷另列。\n\n|畫面|手機 390px|桌面 1440px|\n|---|---|---|\n${screens.map(([label, prefix]) => `|${label}|[手機](${screenshot(prefix, 390)})|[桌面](${screenshot(prefix, 1440)})|`).join("\n")}\n\n其他頁面與 320／768／1024px 的操作結果見 [逐頁矩陣](routes.md) 與 JSON；完整 PNG 可由 E2E 重現至 test-results。\n`);
const widths = (route: string, state: string) => observations.filter(row => row.route === route && row.state === state).map(row => row.width).join("／") || "不適用；見特殊狀態案例";
await writeFile("docs/ui-streamline/routes.md", `# 本版本逐頁驗收矩陣\n\n來源 SHA256：${sourceDigest}。全部為本次隔離 PostgreSQL 與 Chromium 實測。Loading／Error 為真實故障注入；不將靜態來源控制點等同逐按鈕交易成功。\n\n|路由|正常寬度|適用空狀態寬度|Loading|Error|\n|---|---|---|---|---|\n${pages.map(page => `|${page.route}|${widths(page.route, "normal")}|${widths(page.route, "empty")}|${widths(page.route, "loading")}|${widths(page.route, "error")}|`).join("\n")}\n\n角色、用途、權限、原始碼及所有互動清單見 [來源矩陣](../ux-audit/routes.md) 與 [互動清單](../ux-audit/interactions.md)。手機／桌面固定截圖與原始 JSON 校驗見 [證據索引](evidence/index.json)。\n`);
console.log(JSON.stringify({ sourceDigest, pages: pages.length, observations: observations.length, screenshots: assets.filter(asset => asset.file.endsWith(".png")).length }));
