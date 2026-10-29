import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { createHash } from "node:crypto";

// Source inventory, not a claim that a conditional control has been exercised.
const normalize = (value: string) => value.replaceAll("\\", "/");
async function files(dir: string): Promise<string[]> {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry =>
    entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  ))).flat();
}
const sources = (await files("src")).filter(file => /\.[jt]sx?$/.test(file) && !file.startsWith("src/generated/"));
const sourceSet = new Set(sources);
const parsed = new Map(await Promise.all(sources.map(async file => [file, ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)] as const)));
const sourceDigest = createHash("sha256").update([...parsed].sort(([a], [b]) => a.localeCompare(b)).map(([file, source]) => `${file}\n${source.text}`).join("\n")).digest("hex");
const purposes: Record<string, string> = {
  "/": "商城、搜尋、分類、精選與截止商品",
  "/cart": "跨團購物車、數量、改價與庫存重驗",
  "/checkout": "收件資料、選店、配送報價與建立購買",
  "/checkout/[id]": "銀行付款資訊、期限與私有截圖回報",
  "/my/orders": "顧客歷史購買彙總",
  "/my/orders/[checkoutId]": "QB 取消、退款與出貨歷程",
  "/orders/[publicCode]": "歷史訂單授權、取貨付款與取消",
  "/group-buys/[slug]": "商品圖集、SKU 選擇／舊制訂購",
  "/admin": "營運統計、最近訂單與工作入口",
  "/admin/login": "管理員登入與登出失敗提示",
  "/admin/commerce": "SKU、規格、共用庫存、分類與開團販售",
  "/admin/inventory/[skuId]": "完整庫存流水帳與游標分頁",
  "/admin/orders": "歷史訂單搜尋、佇列、篩選與分頁",
  "/admin/orders/[publicCode]": "歷史訂單核款、取消、取貨與物流",
  "/admin/payments": "銀行／配送／門市設定、核帳、建單及例外稽核",
  "/admin/qbuy": "QB 取消退款、退回品檢、重寄與通知工作台",
  "/admin/operations": "Worker 心跳、佇列、告警與安全開關狀態",
};
const handlerGates: Record<string, string> = {
  "/api/admin/group-buy-images": "POST：Admin session、同源、圖片型別／大小與 pending upload 驗證",
  "/api/auth/line/start": "GET：OAuth state 與安全回訪路徑；真實 LINE 外部驗收另列",
  "/api/auth/line/callback": "GET：OAuth state、token 與身分驗證；拒絕流程可離線驗收",
  "/api/auth/line/logout": "POST：同源、清除顧客 session",
  "/api/checkout": "POST：同源、限流、Zod；quote/create 顧客 ownership，其餘 Admin",
  "/api/checkout/[id]/screenshot": "GET：Admin 或顧客 ownership；POST：同源、顧客 ownership、限流、圖片上限／解碼",
  "/api/qbuy": "POST：同源、限流、嚴格命令 schema；cancel/withdraw ownership，其餘 Admin",
  "/api/health/live": "GET：最小公開存活資訊",
  "/api/health/ready": "GET：最小公開就緒狀態，失敗不洩漏底層錯誤",
  "/api/group-buy-images/e2e/[...key]": "GET：僅隨機隔離 E2E DB＋fixture flag，正式環境關閉",
  "/api/logistics/ecpay/store-map/start": "POST：同源、僅一個公開 slug、瀏覽器 HttpOnly binding、有效開團；flow 只允許固定 Checkout 返回",
  "/api/logistics/ecpay/store-map/callback": "POST：權威 state/trade、TTL、商家與物流 subtype、權威門市驗證；不信任跨站 cookie",
  "/api/logistics/ecpay/store-map/test-fixture": "POST：僅隨機隔離 E2E DB＋fixture flag，無外部物流副作用",
};
const entrances: Record<string, string> = {
  "/": "品牌 Logo、返回商城／團購列表連結、直接首頁",
  "/cart": "顧客頁首／商城購物車、商品詳情查看購物車",
  "/checkout": "購物車前往跨團結帳、7-ELEVEN 選店 callback",
  "/checkout/[id]": "建立購買成功、我的訂單本次購買卡片",
  "/my/orders": "顧客頁首與商城我的訂單、錯誤恢復入口",
  "/my/orders/[checkoutId]": "我的訂單與付款頁的取消／退款／配送進度",
  "/orders/[publicCode]": "舊制訂購成功查看訂單、我的訂單歷史卡片、訂單存取連結",
  "/group-buys/[slug]": "商城商品卡查看團購、公開團購連結",
  "/admin/login": "未登入保護路由導向、直接登入頁",
  "/admin": "登入成功、管理導航營運首頁",
  "/admin/commerce": "管理導航 SKU／分類／庫存、庫存紀錄返回商品",
  "/admin/inventory/[skuId]": "商品 SKU 查看完整庫存流水帳",
  "/admin/orders": "管理導航訂單管理、營運首頁訂單入口",
  "/admin/orders/[publicCode]": "訂單列表、營運首頁最近訂單",
  "/admin/payments": "管理導航轉帳核帳、平台監控、QB 工作台核帳入口",
  "/admin/qbuy": "管理導航 QB 取消退款與履約、平台監控",
  "/admin/operations": "管理導航平台監控",
};
for (const [segment, label] of [["products", "商品"], ["suppliers", "供應商"], ["pickup-locations", "取貨地點"], ["group-buys", "團購"]]) {
  purposes[`/admin/${segment}`] = `${label}列表、狀態與管理入口`;
  purposes[`/admin/${segment}/new`] = `新增${label}`;
  purposes[`/admin/${segment}/[id]/edit`] = `編輯${label}，保留既有資料與歷史約束`;
  entrances[`/admin/${segment}`] = `管理導航${label}管理`;
  entrances[`/admin/${segment}/new`] = `${label}列表新增／空狀態入口`;
  entrances[`/admin/${segment}/[id]/edit`] = `${label}列表編輯；商品／團購也可從 SKU 工作台進入`;
}
function resolveImport(file: string, specifier: string) {
  const base = normalize(specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : path.join(path.dirname(file), specifier));
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(candidate => sourceSet.has(candidate));
}
const imports = new Map([...parsed].map(([file, source]) => [file, source.statements.flatMap(statement => {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) return [];
  const target = resolveImport(file, statement.moduleSpecifier.text);
  return target ? [target] : [];
})]));
function closure(file: string, visited = new Set<string>()): Set<string> {
  if (visited.has(file)) return visited;
  visited.add(file);
  for (const dependency of imports.get(file) ?? []) closure(dependency, visited);
  return visited;
}
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const interactions: { id: string; file: string; line: number; tag: string; attributes: Record<string, string>; text: string; conditions: string[]; status: string }[] = [];
const behavior: { file: string; kind: string; exports: string[] }[] = [];
for (const [file, source] of parsed) {
  const directive = source.statements[0]?.getText(source);
  if (directive === '"use client";' || directive === '"use server";' || /\/route\.ts$/.test(file)) {
    behavior.push({ file, kind: /route\.ts$/.test(file) ? "route-handler" : directive.includes("server") ? "server-actions" : "client-component", exports: source.statements.filter(statement => ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).map(statement => compact(statement.getText(source).split("{")[0])) });
  }
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (["button", "a", "Link", "input", "textarea", "select", "summary", "form", "QbuyForm", "CommerceForm", "Field", "FormField"].includes(tag)) {
        const attributes: Record<string, string> = {};
        for (const attribute of node.attributes.properties) if (ts.isJsxAttribute(attribute)) attributes[attribute.name.getText(source)] = compact(attribute.initializer?.getText(source) ?? "true");
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const conditions: string[] = [];
        let ancestor: ts.Node | undefined = node.parent;
        while (ancestor && !ts.isFunctionDeclaration(ancestor) && !ts.isArrowFunction(ancestor)) {
          if (ts.isConditionalExpression(ancestor)) conditions.push(compact(ancestor.condition.getText(source)));
          if (ts.isBinaryExpression(ancestor) && ancestor.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) conditions.push(compact(ancestor.left.getText(source)));
          ancestor = ancestor.parent;
        }
        const text = ts.isJsxElement(node.parent) ? compact(node.parent.children.map(child => child.getText(source)).join(" ")) : "";
        interactions.push({ id: `${file}:${line}:${interactions.length + 1}`, file, line, tag, attributes, text, conditions, status: attributes.type === '"hidden"' ? "hidden-payload-not-clickable" : "source-inventoried-see-cases-and-runtime-evidence" });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const routePath = (file: string) => "/" + file.replace(/^src\/app\//, "").replace(/\/(page|route)\.[jt]sx?$/, "").replace(/^(page|route)\.[jt]sx?$/, "").split("/").filter(part => !/^\(.+\)$/.test(part)).join("/");
const routes = sources.filter(file => /\/(page|route)\.[jt]sx?$/.test(file)).map(file => {
  const dependencies = closure(file);
  const directory = path.dirname(file);
  const layouts = sources.filter(candidate => /\/layout\.tsx$/.test(candidate) && normalize(directory).startsWith(path.posix.dirname(candidate)));
  for (const layout of layouts) closure(layout, dependencies);
  const route = routePath(file);
  return { route, file, kind: file.endsWith("route.ts") ? "handler" : "page", purpose: purposes[route] ?? "HTTP 邊界（方法、輸入與權限見來源及專屬測試）", role: route.startsWith("/api/") ? "依 HTTP 方法／命令，見進入條件" : route.startsWith("/admin") ? route === "/admin/login" ? "anonymous-admin" : "admin" : /^\/(checkout|my\/orders)/.test(route) ? "customer" : "public-or-owner", entryConditions: handlerGates[route] ?? (route === "/admin/login" ? "未登入的管理員；已有有效 session 時轉工作台" : route === "/cart" ? "可匿名；瀏覽器本機購物車，價格與資格由伺服器重驗" : route.startsWith("/admin") ? "伺服器 requireAdmin；動態 ID 必須存在" : /^\/(checkout|my\/orders)/.test(route) ? "顧客 session；動態購買 ID 必須屬於本人" : route.startsWith("/orders/") ? "公開存取驗證入口；詳情須 ownership 或有效訂單存取權杖" : "公開路由；商品須符合展示資格"), navigation: entrances[route] ?? "由前端表單／API caller 或供應商 callback 進入；詳見來源", layouts, dependencies: [...dependencies], interactionIds: interactions.filter(item => dependencies.has(item.file)).map(item => item.id), status: "source-inventoried-see-page-state-results" };
}).sort((a, b) => a.route.localeCompare(b.route));
await mkdir("docs/ux-audit", { recursive: true });
await writeFile("docs/ux-audit/inventory.json", JSON.stringify({ version: 2, sourceDigest, routes, behavior, interactions }, null, 2) + "\n");
const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
await writeFile("docs/ux-audit/routes.md", `# 全站來源路由盤點\n\n由 scripts/ux-inventory.ts 自動掃描。頁面 ${routes.filter(route => route.kind === "page").length}；Route Handlers ${routes.filter(route => route.kind === "handler").length}。靜態盤點不等於操作通過。動態路由須使用隔離 fixture；驗收結果見 README.md 與 evidence。\n\n來源摘要 SHA256：${sourceDigest}\n\n|路由|用途|類型／角色|進入條件|導覽入口|來源|互動來源數|驗收狀態|\n|---|---|---|---|---|---|---|---|\n${routes.map(route => `|${route.route}|${route.purpose}|${route.kind}／${route.role}|${route.entryConditions}|${route.navigation}|${route.file}|${route.interactionIds.length}|${route.status}|`).join("\n")}\n`);
await writeFile("docs/ux-audit/interactions.md", `# 互動來源矩陣\n\n共 ${interactions.length} 個 JSX 來源位置，包含條件內控制與共用表單實例。每個位置的完整屬性、disabled、條件、內容及頁面依賴在 inventory.json。陣列產生的規格／狀態選項須逐資料狀態驗證；來源數不是執行次數。\n\n驗收維度：適用的正常、停用、焦點、鍵盤、防重送、成功、錯誤、重整、返回、權限、斷線、長文與七尺寸。導覽免財務副作用檢查；財務操作必須隔離、保留二次確認及資料庫斷言。\n\n|來源|元件|名稱／操作|出現條件|狀態|\n|---|---|---|---|---|\n${interactions.map(item => `|${item.file}:${item.line}|${item.tag}|${cell(item.attributes.label ?? item.attributes["aria-label"] ?? item.attributes.name ?? item.attributes.operation ?? item.text).slice(0, 240)}|${cell(item.conditions.join("；")).slice(0, 320)}|${item.status}|`).join("\n")}\n`);
console.log(JSON.stringify({ pages: routes.filter(route => route.kind === "page").length, handlers: routes.filter(route => route.kind === "handler").length, interactions: interactions.length, behaviorFiles: behavior.length }));
