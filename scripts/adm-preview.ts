import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { Client } from "pg";
import { deriveE2eControlDatabaseUrl, deriveE2eDatabaseUrl, generateE2eDatabaseName, isValidE2eDatabaseName, validateE2eSourceDatabaseUrl } from "./lib/e2e-database";

// Credentials and ownership live only in this ignored, local manifest. No production URL is accepted.
const dir = resolve(".temp/adm-preview");
const file = resolve(dir, "manifest.json");
type Manifest = { version: 1; database: string; marker: string; email: string; password: string; complete: boolean; scenarios?: unknown };
const source = process.env.DATABASE_URL ?? "";
validateE2eSourceDatabaseUrl(source);
if (process.env.QBUY_ENV === "production" || process.env.QBUY_ENV === "staging") throw new Error("僅限隔離本機測試環境。");
const command = process.argv[2] ?? "info";
if (!["seed", "start", "info", "clean", "verify"].includes(command)) throw new Error("使用 seed / start / info / clean / verify。");
let manifest: Manifest | undefined;
try { manifest = JSON.parse(await readFile(file, "utf8")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
if (manifest && (manifest.version !== 1 || !isValidE2eDatabaseName(manifest.database) || !/^[a-f0-9]{32}$/.test(manifest.marker))) throw new Error("測試環境識別無效，停止操作。");
const run = (args: string[], env: NodeJS.ProcessEnv) => new Promise<void>((yes, no) => {
  const child = spawn(process.execPath, args, { env, stdio: "inherit", shell: false, windowsHide: true });
  child.on("error", no); child.on("exit", code => code === 0 ? yes() : no(new Error(`子程序失敗 (${code})`)));
});
async function owned(m: Manifest) {
  const client = new Client({ connectionString: deriveE2eDatabaseUrl(source, m.database) }); await client.connect();
  try { const result = await client.query("SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()"); if (result.rows.length !== 1 || result.rows[0].marker !== m.marker) throw new Error("資料庫不屬於此預覽，停止操作。"); } finally { await client.end(); }
}
if (command === "seed" && !manifest) {
  const m: Manifest = { version: 1, database: generateE2eDatabaseName(), marker: randomBytes(16).toString("hex"), email: "adm-preview@example.invalid", password: randomBytes(24).toString("base64url"), complete: false };
  const control = new Client({ connectionString: deriveE2eControlDatabaseUrl(source) }); await control.connect();
  try { await control.query(`CREATE DATABASE "${m.database}"`); await control.query(`COMMENT ON DATABASE "${m.database}" IS '${m.marker}'`); } finally { await control.end(); }
  await mkdir(dir, { recursive: true }); await writeFile(file, JSON.stringify(m, null, 2), { mode: 0o600 }); manifest = m;
}
if (!manifest) throw new Error("尚未建立預覽，請先執行 npm run adm:preview:seed。");
await owned(manifest);
const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: deriveE2eDatabaseUrl(source, manifest.database), NODE_ENV: "development", QBUY_ENV: "test", QBUY_ENABLE_LINE_PUSH: "false", QBUY_ENABLE_LOGISTICS_EXTERNAL: "false", LINE_MESSAGING_ENABLED: "false", QBUY_ENABLE_STOREFRONT: "true", QBUY_ENABLE_LOGIN: "true", QBUY_ENABLE_CHECKOUT: "true", QBUY_ENABLE_BANK_DETAILS: "true", QBUY_ENABLE_HOME_DELIVERY: "true", QBUY_ENABLE_FAMILY_MART: "true", QBUY_ENABLE_SEVEN_ELEVEN: "true" };
if (command === "clean") {
  // An explicit clean only drops the validated, generated database whose ownership marker matched.
  const control = new Client({ connectionString: deriveE2eControlDatabaseUrl(source) }); await control.connect();
  try { await control.query(`DROP DATABASE "${manifest.database}" WITH (FORCE)`); } finally { await control.end(); }
  await rm(file); console.log("已清理此 ADM 預覽資料庫，既有開發資料未變更。");
} else {
  if (command === "seed" && !manifest.complete) {
    await run(["node_modules/prisma/build/index.js", "migrate", "deploy"], env);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/fixtures/adm-orders.ts"], env);
    manifest = JSON.parse(await readFile(file, "utf8")) as Manifest;
  }
  if (!manifest.complete) throw new Error("預覽資料建立未完成。請先 clean 再 seed；不會覆蓋或清空既有資料。");
  if (command === "seed" && process.env.CI) console.log("ADM 隔離資料已建立；登入資訊只保存在忽略的本機 manifest。");
  if (command === "info" || (command === "seed" && !process.env.CI)) {
    console.log(`預覽：http://localhost:3200/admin\n帳號：${manifest.email}\n密碼：${manifest.password}\n30 筆合成購買紀錄；登入資料僅保存於 .temp/adm-preview/manifest.json。\n啟動：npm run adm:preview`);
  }
  if (command === "verify") await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-adm-preview.ts"], env);
  if (command === "start") await run(["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3200"], env);
}
