# QBUY 修正與驗證紀錄（2026-11-07）

## 範圍

直接修改 `D:\my-group-buying`，基底為 `fc308a0`，分支 `codex/qbuy-current-pr79-20261105T174109Z`。沒有另外建立開發 worktree，沒有 commit、push、merge 或部署。

已修正：

1. 結帳、建立物流、退回品檢共用旋轉尺寸與累計高度／重量／體積規則，避免結帳可通過卻無法出貨。
2. 加入購物車等待伺服器驗證時，偵測其他分頁的變動並拒絕覆寫。修改／移除單項時重新讀取最新內容；同頁與跨分頁購物車數量立即同步。
3. operations health 排除已全部取消的配送群組，以及已有有效替代物流的歷史退回／作廢。
4. production 的 7-11 配置不得混用測試物流環境；選店起始路由套用功能開關與共用限流。
5. 純結帳預估改採 RepeatableRead 一致快照，不再逐筆取得寫入／共享鎖。真正下單保留原鎖定順序、重新驗價、庫存驗證與預留交易。
6. 商城每頁 24 團，提供上下頁；先在資料庫篩選排序，再聚合該頁價格與庫存，不載入全部 SKU/options。保留全域精選順序及未盤點／已售完語義。
7. 後台搜尋及待出貨列表僅取得該頁最多 20 個 ID，工作台直接取得聚合計數；無搜尋的訂單列表維持原 Prisma 分頁。

沒有 schema、migration、依賴、環境檔、快取或索引變更。正式資料庫與真實通知／物流均未使用。開發根目錄原本乾淨，這次變更留在工作樹供直接執行與審查。

## 再次檢查

重新檢查本輪差異及新增測試，未發現阻擋問題。特別確認實際結帳鎖定與庫存一致性保留、SQL 使用參數化條件、分頁前套用完整條件、取消／重寄關聯正確。

採用專案 `AGENTS.md`、software-engineering 工作指引及已安裝 Next.js 16.4.1 文件。未安裝額外技能或套件。

## 已實際執行的檢查

|檢查|結果|
|---|---|
|全專案 ESLint|通過|
|Prisma generate + Next typegen + TypeScript noEmit|通過|
|Prisma validate|通過|
|完整 Vitest|927 通過、93 跳過；93 個檔案通過、7 個整合檔預設跳過|
|獨立 PostgreSQL commerce integration|91 通過，0 失敗|
|Production build|通過，Next.js 16.4.1 Turbopack|
|完整 Chromium E2E|19 通過，0 跳過，約 1.9 分鐘|
|git diff --check|通過|

使用既有安裝的 CLI，主要命令如下：

```powershell
node node_modules/eslint/bin/eslint.js
node node_modules/prisma/build/index.js generate
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node node_modules/prisma/build/index.js validate
node node_modules/vitest/vitest.mjs run
node --import tsx scripts/run-commerce-integration.ts
node --import tsx scripts/run-e2e.ts
git diff --check
```

建置與 runner 使用既有本機工具，停用選用遙測／套件檢查網路請求；未更新套件或 lockfile。Windows 一般執行權限無法建立 Turbopack 必需 junction，經允許的本機執行模式完成。這不是程式編譯錯誤。

整合測試覆蓋多客競爭最後庫存、重複請求、實際下單與付款、取消／退款／重寄、快照不變性、純預估不被商品寫鎖阻塞，以及 27 團跨頁／精選／庫存語義。

E2E 走真實本機瀏覽器與應用路由，涵蓋 ADM、跨團購物車、付款、取消、退款、物流、首頁與多尺寸。此次另加入同頁和第二分頁 badge 即時更新斷言。外部 LINE／綠界採本機合成 fixture，不代表已實測正式供應商。

新增 health 回歸測試最初因修改不可變快照而被資料庫正確拒絕，已改為只調整測試時鐘，不移除或繞過保護；上述 91 項為修正後完整重跑結果。

## 效能與資料安全

詳見同目錄 `performance.md` 與 `performance-summary.json`。測試使用新建、具隨機名稱的本機隔離資料庫，沒有把測試資料寫入開發或正式資料庫。每次測試停止自有伺服器、關閉連線、刪除自有資料庫並檢查清理結果。

原始本機紀錄：

- `.temp/review-unit-final.log`
- `.temp/review-commerce-final.log`
- `.temp/review-e2e-verified.log`
- `.temp/perf-review-20261107/`

## 限制與後續觀察

- 瀏覽器驗證是 Chromium，不等同實體 Safari／Android 測試。
- localStorage 仍非跨分頁原子交易資料庫；這次修正非同步等待與過期畫面的實際覆寫問題，沒有另建儲存架構。
- 真正下單仍保留逐項鎖以維護一致性，未以移除保護換取效能。
- 沒有足夠證據就不新增索引；實測查詢計畫與資料量限制記錄於效能報告。
- 現有 pg 8 依賴會輸出未來 pg 9 concurrent-query 棄用警告。本輪不擅自升級依賴，測試皆通過。
- 這次沒有執行遠端 CI、部署、正式物流或正式通知，也不把預設跳過的整合測試算成成功。
