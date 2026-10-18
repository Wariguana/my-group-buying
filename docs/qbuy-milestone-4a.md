# QBUY 快易購｜里程碑 4A 交付與驗收

基準：`67a06617a1a27ceb97db623a451cb955177186bb`（PR #70）；本機 `D:/my-group-buying`，起始工作樹乾淨、remote main 一致、Docker PostgreSQL17 healthy。4A 不授權 4B，不公開 Production、不購買資源、不做真實收退款、寄件或推播。

## 工程交付

- `src/lib/operations`、health routes、Admin operations：持久化限流、worker session lock／心跳／安全失敗紀錄、業務 aging／異常 counts、有限時 readiness。新建 Checkout 在 production 亦要求逾期 worker 近3分鐘成功。
- `config.ts`／`preflight.ts`／交易入口：分離商城、登入、Checkout、銀行資料、各配送、真實 LINE、外部物流開關；正式預設關閉。Staging 禁止真實外部副作用，測試模式限 loopback 隨機 DB。舊制新下單在 deployed 環境由服務層拒絕，歷史流程保留。
- `run-worker.ts`：獨立常駐 30s loop，最多100到期／20通知，專用 direct PostgreSQL advisory lock；same job重複啟動跳過，程序中止後鎖釋放、outbox lease恢復、固定 retry key。失敗不輸出私人 payload。通知狀態更新以 attempts/status fencing 避免舊嘗試覆寫新嘗試結果。
- 新 migration `20261019000000_production_operations`：只新增 WorkerHeartbeat、RequestRateLimit、ConfigurationAudit 與不可改刪 trigger，沒有刪改既有資料或 migration。銀行／運費／門市設定與設定稽核同 transaction，保存 actor/time/target/fingerprint，不複製完整收款資訊。
- DB pool上限10／connect5s／idle30s／statement20s；部署roles樣板分 migration/runtime 並限制稽核更新。Docker非root、固定base digest、compose私有port與restart、外部TLS/DB前置條件。
- 更新 [Runbook](beta-launch.md)、[架構與月費](production-architecture.md)、[備份恢復](production-backup.md)、[依賴矩陣](go-live-dependencies.md)、[安全審查](production-security-review.md)。

## 可重現驗收與證據位置

所有命令在 repository root 執行。`.temp/4a-*.log`、`test-results/` 為本機忽略的執行證據，不提交 secrets、備份或測試帳號。

|檢查|結果／證據|
|---|---|
|Prisma validate、typecheck|已執行通過|
|lint|0 errors；既有 integration `_sql` unused warning 1則|
|完整 unit|1,959 passed；162 skipped另列（整合測試在下一列獨立啟用）|
|真實 PostgreSQL integration|165 passed、0 skipped；限流20併發只允許5、雙worker互斥／失敗恢復、stale heartbeat、設定audit禁改刪、角色拒絕DDL/audit刪除、原交易競態與冪等|
|Chromium E2E|20 passed、0 skipped；含M1/M2/M3、手機390px顧客回報／Admin核帳與取消退款／合併履約／退回重寄、operations授權與畫面|
|production build|E2E runner實際production build，另有Linux Docker build|
|development備份還原＋migration|`verify-qbuy-migration.ts` 實際pg_restore、22 migrations、零drift、所有原欄位雜湊一致；development安全套用22後再次比較一致，保留18舊Order、18OrderItem、19選店紀錄|
|非空私有截圖還原|`verify-screenshot-restore.ts` 在兩個自有隔離DB間dump/restore，檢查SHA256、可解碼PNG、付款關聯與應付金額；本機約10.5秒的小型合成案例，不當成正式RTO|
|Linux隔離容器故障與回退|執行 `node --import tsx scripts/verify-container-readiness.ts qbuy:milestone-4a-local qbuy:milestone-3-rollback`；已通過錯版 migration 阻擋、預設關閉、DB 中斷503與恢復、worker終止後新心跳、M3基準版本在22個migration的DB上啟動首頁與Admin登入；20個並行ready請求p95為35ms（僅本機health，非交易容量）。詳細結果見 `.temp/4a-container-drill-final.log`|
|npm audit --omit=dev|0 high/critical；fast-uri moderate 1項，見安全審查；未自動改依賴|
|GitHub CI / Security / Trivy|以本次PR最終head checks及交付回報為準，不能用較舊SHA成功結果替代|

完整交易驗收的銀行入帳、退款、寄件憑證與 LINE adapter 均為模擬。測試付款已入帳但建單中途失敗會保留BankReceipt／confirmedAmount及預留，移除隔離故障後相同流程可安全重試；已回報/異常不被到期worker釋庫存。兩Admin並行、重複物流事件、取消與出貨競態、LINE API失敗重試與通知不回滾主交易均由既有整合案例重新執行。

初次執行曾因新推播開關使舊adapter測試未明確開啟、合成截圖使用錯誤主鍵、Docker build缺少非秘密Prisma URL、故障探測逾時短於DB連線逾時而需要修正。失敗輪次不計passed；以修正後證據為準。

## 未完成與正式 No-Go

外部Staging尚無固定HTTPS、正式同等網路/秘密管理/物件儲存/真實OAuth，所以本機隔離結果不標為完整 STAGING VERIFIED。正式實際銀行入退款、物流交寄與簽收、LINE真實推播與blocked/unfollow驗收均未做。DB供應商PITR、異地加密備份恢復、真實告警接收人、正式容量壓測、跨區災難與完整交易回退核對仍需要核准資源與負責人。

|標籤|判定|說明|
|---|---|---|
|ENGINEERING READY|本次工程範圍須以最終CI／Security通過為完成條件|程式、可重現測試、Runbook與配置已交付；不得替代營運條件|
|STAGING VERIFIED|完整外部Staging未達成|只有本機隔離DB、production-mode UI與容器驗證|
|EXTERNAL PENDING|是|完整項目、責任角色與阻擋條件見Dependency Matrix|
|PRODUCTION READY|否／NO-GO|銀行、物流、LINE、網域、主機、DB、備份、監控、條款及成本必要條件尚缺|
|LIVE|否|沒有公開服務；未執行4B|

下一個核准關卡：由專案負責人選定並核准資源與費用、指定依賴負責人和告警值班、取得正式條款/個資政策審查；完成外部Staging與實際小額金流物流LINE驗收後，另行授權4B。相關PR、merge commit與最終main SHA於本次交付回報列出。
