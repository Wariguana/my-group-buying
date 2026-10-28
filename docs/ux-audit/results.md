# 本機實測結果

2026-10-29，Asia/Taipei。基準 PR #73，最終 Git SHA 及遠端 CI／Security 以交付訊息和 PR 最後 HEAD 為準。

|命令／範圍|實際結果|
|---|---|
|npm ci|依既有 lockfile 同步；無依賴規格差異|
|npm run lint|通過，0 error／warning|
|npm run typecheck|通過|
|npm run test -- --maxWorkers=2|2012 passed；163 skipped 不計成功|
|npm run test:integration:orders|166 passed、0 skipped；自有隔離 PostgreSQL|
|npm run test:integration:auth|23 passed、0 skipped；2 真 PG 案例＋21 guards|
|npm run test:e2e|Chromium 34 passed、0 skipped；包含 production build|
|npm run build|通過，與 typecheck 順序執行|
|npx prisma validate|通過；22 migrations 不變|
|npm audit --json|0 vulnerabilities（含 dev）|
|git diff --check|通過|

共有 29 個頁面、13 個 handlers、361 個 JSX 控制來源與 2 個 handler HTML 畫面。382 次具名頁面狀態／尺寸觀察，278 張截圖。Normal：29/29 頁 × 7 尺寸；Loading：29/29、Error：29/29（390px）；適用 Empty：16/16 頁 × 7 尺寸；404 × 7、商品售完／截止各一個 390px 狀態。這些計數不把圖片數或來源列數當作獨立交易測試數。

目前列明驗收範圍沒有未修正的已確認 P0／P1／P2，也沒有本機測試阻塞；不能將此解讀為窮舉所有未知問題或完整 WCAG AA 證明。逐頁證據見 page-state-results.md，實際操作與限制見 cases.md，全部原始圖片及校驗值見 evidence/index.json。

原 development 仍為 22 migrations、18 Order、18 OrderItem、0 QbOrder；無隔離測試庫遺留。Prisma schema／migrations／package.json／package-lock.json 對基準無差異。沒有 Production、真實銀行／物流／LINE 副作用。

失敗輪次已記錄於 fixes.md；生成目錄快取曾導致獨立 build 失敗，保留診斷後乾淨重建成功。曾保留於 .temp 的生成備份被 ESLint 掃描，僅移除本工作建立的該生成備份後，原始碼 lint 再驗為零。未修改 lint 規則、放寬 DB 約束或移除既有測試。
