import { readdir, readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

async function files(directory: string): Promise<string[]> {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
type RecordRow = { route: string; state: string; width: number; screenshot?: string | null; geometry?: { scroll: number }; scrollWidth?: number; unnamed?: unknown[]; contrast?: unknown[] };
const inventory = JSON.parse(await readFile("docs/ux-audit/inventory.json", "utf8"));
const results = await files("test-results");
const lastRun = JSON.parse(await readFile("test-results/.last-run.json", "utf8"));
if (lastRun.status !== "passed") throw new Error("Refusing to publish evidence from a failed Playwright run.");
const records: RecordRow[] = [];
for (const name of ["route-results.json", "empty-results.json", "catalog-results.json", "product-state-results.json", "loading-results.json", "error-results.json"]) {
  const file = results.find(file => path.basename(file) === name);
  if (!file) throw new Error(`Missing ${name}`);
  const value = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(value) && value.sourceDigest !== inventory.sourceDigest) throw new Error("Stale source inventory; regenerate and rerun verification.");
  if (value.errors?.length) throw new Error("Unexpected browser errors.");
  records.push(...(Array.isArray(value) ? value : value.records));
}
for (const record of records) {
  if ((record.geometry?.scroll ?? record.scrollWidth ?? record.width) > record.width || record.unnamed?.length || record.contrast?.length) throw new Error(`Unresolved failure on ${record.route}`);
}
const destination = "docs/ux-audit/evidence";
await mkdir(destination, { recursive: true });
const assets: { file: string; sha256: string; bytes: number }[] = [];
for (const file of results.filter(file => /\.(png|json)$/.test(file) && path.basename(file) !== ".last-run.json")) {
  const relative = path.relative("test-results", file).replaceAll("\\", "/");
  const output = path.join(destination, relative);
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(file, output);
  const content = await readFile(file);
  assets.push({ file: relative, sha256: createHash("sha256").update(content).digest("hex"), bytes: content.length });
}
const pages = inventory.routes.filter((route: { kind: string }) => route.kind === "page");
const summary = { sourceDigest: inventory.sourceDigest, pages: pages.length, handlers: inventory.routes.length - pages.length, sourceInteractions: inventory.interactions.length, observations: records.length, states: Object.fromEntries([...new Set(records.map(row => row.state))].map(state => [state, records.filter(row => row.state === state).length])), screenshots: assets.filter(asset => asset.file.endsWith(".png")).length, assets };
await writeFile(`${destination}/index.json`, JSON.stringify(summary, null, 2) + "\n");
await writeFile("docs/ux-audit/page-state-results.md", `# 逐頁狀態實測\n\n來源 SHA256：${inventory.sourceDigest}。Normal 七尺寸、Loading／Error 真實邊界於 390px；適用的首次空狀態七尺寸。Error 使用不存在的隔離 DB 帳號，Loading 僅在自有測試 DB 暫鎖 session table 後 rollback，不修改資料／schema。\n\n|路由|Normal 寬度|Empty 寬度|Loading|Error|\n|---|---|---|---|---|\n${pages.map((page: { route: string }) => {
  const widths = (state: string) => records.filter(row => row.route === page.route && row.state === state).map(row => row.width).join("／") || "不適用或另見特殊狀態測試";
  return `|${page.route}|${widths("normal")}|${widths("empty")}|${widths("loading")}|${widths("error")}|`;
}).join("\n")}\n\n全數截圖與 SHA256 見 [evidence/index.json](evidence/index.json)。此表驗證列明的狀態與尺寸，不代表每個業務條件均有七尺寸獨立 screenshot diff。特殊流程與元件狀態見 cases.md。\n`);
console.log(JSON.stringify({ ...summary, assets: undefined }));
