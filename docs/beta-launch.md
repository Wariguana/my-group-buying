# QBUY 快易購部署與營運 Runbook（里程碑 4A）

本文件取代早期單團 Beta 手冊。4A 只準備工程與隔離驗證；任何 Production 部署、付費資源、真實收退款、寄件及 LINE 推播均需另行核准。驗收摘要見 [4A 報告](qbuy-milestone-4a.md)，外部依賴見 [Go-Live Matrix](go-live-dependencies.md)。

## 業務流程與相容範圍

新版：多團購物車 → Checkout 原子預留 → 6 小時內匯款並回報 → REPORTED 待人工核帳 → 記錄實際銀行入帳 → finalize 建立各團 QbOrder。REPORTED／ANOMALY 不得由到期 worker 自動釋放庫存。收到轉帳回報不代表已入帳；入帳成功但未建單需至 `/admin/payments` 重試並查核。

QB 取消須顧客申請、Admin 審核；退款義務與已退款分開，只有實際銀行退款、交易參考與二次確認後才標記 REFUNDED。FulfillmentGroup 可跨多張 QB 單，單張 QB 也可跨多個群組。首度交寄扣實體庫存與 allocated；重複事件／退回重寄不再扣一次。退回先實收與品檢，實收起 7 天逾期進客服佇列，不自動沒收或回補。詳細規則見 [M3](qbuy-milestone-3.md)。

舊 Order 保留 `/admin/orders`、既有顧客查單、舊付款／取消／取貨相容功能；不拿舊狀態或取消規則處理 QbOrder。Production 的舊 `/group-buys/*` 下單 POST 停用，歷史讀取保留。舊單必須由營運列冊核對，不能直接轉成 QB 訂單。

7-ELEVEN 選店只選擇並核實門市，不會自動寄件。全家為人工核實門市清單，並非正式物流商 API。LINE outbox 為已實作的非同步通知，尚無正式通道驗收；HTTP accepted 不等於使用者收到或閱讀。

## 環境與部署順序

執行環境為 Node 24、Next.js App Router、PostgreSQL 17。`Dockerfile` 使用非 root 使用者，保留 tsx／Prisma 以同一版映像執行 worker 與 migration；正式映像含工程工具，須限制 registry 與執行權限。`deploy/compose.yaml` 僅將 web 綁定主機 loopback，資料庫與 TLS edge 為獨立前置條件，沒有自動購買或公開部署。

1. 記錄 main SHA、乾淨工作樹、CI／Security 成功的同一個 head SHA。把映像標籤及實際 digest 寫入變更紀錄；不要覆寫既有 release tag。
2. 建立隔離 Staging DB、獨立登入角色、圖片 bucket／前綴、LINE 測試通道與測試資料。禁止複製正式個資。Staging 與 Production 不共用 DB、session 或密鑰。
3. 使用秘密管理設定 `NODE_ENV=production`、`QBUY_ENV=staging` 或 `production`、固定 `APP_BASE_URL=https://...`、APP role `DATABASE_URL`。正式環境不得含任何 E2E_*、NEXT_DEV_ALLOWED_ORIGIN、Quick Tunnel 或測試憑證。
4. 每項 `QBUY_ENABLE_*` 預設關閉：STOREFRONT、LOGIN、CHECKOUT、BANK_DETAILS、SEVEN_ELEVEN、FAMILY_MART、HOME_DELIVERY、LINE_PUSH、LOGISTICS_EXTERNAL。`CheckoutSettings.enabled`、ShippingRate 與商品物流證據仍需同時正確。開 Checkout 必須明確核准 `QBUY_COMMERCE_APPROVAL=approved`，並啟用 LOGIN、BANK_DETAILS 與至少一種已驗收配送。此值只能由簽署 Matrix 的負責人核准，不是自動核准機制。
5. `npm run preflight` 必須成功。LINE Login callback 必須與固定 origin 完全一致。Staging 拒絕真實推播及正式 ECPay 環境。測試逃生通道只接受本機隨機 E2E DB，不能用它啟動正式服務。
6. 先完成已加密且可還原的備份。在 Staging 以 migration 專用憑證執行 `npx prisma migrate deploy`、`npx prisma migrate status`、`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`。不使用 db push／reset，不改已套用 SQL。
7. migrations 以 qbuy_migrator 擁有物件；web/worker 只有 qbuy_app membership。參考 `deploy/database-roles.sql`，角色登入密碼另由秘密管理器注入；每次 migration 後重新套用 audit 表限制。確認 runtime 不能 DDL、改 `_prisma_migrations`、刪改稽核表或成為 migrator。
8. 建置 `docker build -t qbuy:<reviewed-sha> .`。將 RELEASE_TAG、QBUY_ENV_FILE 指向核准的隔離環境，啟動 `docker compose -f deploy/compose.yaml up -d`；4A 僅允許本機／隔離 Staging。`npm start` 的 prestart 執行 preflight；不要跳過它直接用 next start。
9. 反向代理只允許正式 Host，覆寫 Host／X-Forwarded-Host／X-Forwarded-Proto，拒絕客戶端偽造 forwarding headers。上傳 body 上限 5 MiB（另留適當 HTTP 邊界），登入與 API 加 IP 限流、30 秒 request timeout；TLS 1.2+、HSTS 待 HTTPS 驗收後設定。web port 不得直接公開。
10. 驗證 health、worker 心跳、Admin `/admin/operations`、私人圖片授權與完整交易；另驗證手機 390px 操作與備份還原。正式啟用必須停在 4B 核准關卡。

## 背景工作與告警

常駐 `npm run worker -- checkouts`、`npm run worker -- notifications`，每次完成後等待 30 秒，不依賴 Windows 桌面。每次最多處理 100 逾期 Checkout／20 通知事件，失敗安全紀錄後下一輪重試。也可由平台排程每分鐘 `--once`，但不能同時再開另一組不受控排程。每類 job 有專用 PostgreSQL session advisory lock；程序死亡釋放鎖，事件 lease 到期後恢復。禁止 transaction-pooling PgBouncer 用於 advisory lock 連線，必須 direct/session connection。

`scripts/expire-checkouts.ts` 和 `scripts/run-notifications.ts` 同樣使用 workerTick。成功寫入 WorkerHeartbeat；失敗保留上次成功並記錄 WORKER_FAILED，不記錄個資。停止接受新輪次後 SIGTERM 最多等待目前輪次結束；強制中止後依鎖／lease 恢復。LINE_PUSH 停用時 worker 成功心跳但不消耗 outbox 重試，CLI 告警略過通知積壓但 Admin 仍顯示；啟用後仍檢查 LINE_MESSAGING_ENABLED、provider、核實身份、同意與推播資格。超過 23 小時／8 次或不可重試 4xx 停止；不得人工換 retry key 盲目重送。

`/api/health/live` 只驗證 HTTP 程序；`/api/health/ready` SELECT 1，DB 失敗回 503，不洩漏憑證。`npm run operations:check` 提供內網排程 JSON 和非零 exit code；不要把此詳細輸出公開。Admin 可查看 heartbeat、逾期積壓、24h 待核帳／異常／退款／取消、15min 入帳未建單、截止後待建物流、退回逾期、通知積壓與庫存負數。待交寄與退回／作廢為人工檢視候選，並非全部都是系統故障。

告警責任：平台 on-call 處理 HTTP/DB、worker、備份；營運值班處理核帳／退款／物流；帳務差異交財務核實。接收人尚未指定，正式告警驗收 BLOCKED。平台每分鐘從另一故障域監看 ready，連續 3 次失敗或心跳 >3 分鐘 page 一次；expired >2 分鐘、入帳未建單 >15 分鐘、庫存異常為高優先。業務 aging 每 30 分鐘彙總，人工佇列每天日結。以環境＋規則 dedupe、恢復再通知、同案件 60 分鐘內抑制重複；維護需限時靜音，禁止永久靜音。外部監控才能發現主機整體停機，僅 Admin 頁面不夠。

Pool 每程序上限 10、connect 5s、idle 30s、statement 20s；每 worker 額外 1 條 advisory connection。1 web＋2 worker 約 32 條，migration／備份／監控另保留至少 10 條。擴容前重算總連線限制；監控 slow query／deadlock／連線等待，保持 transaction pooling 與 session-lock 需求分離。

## 日結與事故處理

每日比較銀行實際交易、BankReceipt、Payment.confirmedAmount、QB paidAmount、退款義務與實際退款憑證。已退款不應再自動更改，後續溢付款獨立新增義務。人工記錄核對日期、操作者、差異與處理單，不用一般備註儲存完整帳號。

發現錯價／庫存／入帳未建單：先關 CHECKOUT（必要時 BANK_DETAILS），保留登入、查單及客服；已回報案件不釋庫存；BANK_DETAILS 關閉只隱藏銀行資訊，已匯款顧客仍能提交回報。通知故障只停 LINE_PUSH，不回滾金流。錯誤寄件先停相關配送建立，核實外部作廢證據後再操作。資料庫故障先停止新交易，保留 logs／SHA／事件時間，平台恢復後重試相同 requestId，不重建付款或任意改 DB 狀態。

回退：先關新交易與外部副作用、停止 worker、記錄 backlog／備份、將應用切回已驗證映像；保留 additive schema，第 22 migration 只加表，可讓舊版忽略。舊版沒有本版新開關，回退時必須由 edge 封鎖新交易／LINE 對外網路，不能依賴舊程式認得新 env。不得 down-migrate 刪表或對有新增交易的 DB 直接覆蓋舊 dump。資料事故只能在另建隔離 DB 還原、核對事故期間銀行與訂單差異、由資料負責人核准切換。正式回退 RTO 必須由實際 Staging 演練測量。

## 備份與恢復

參考 [備份方案](production-backup.md)。既有 db:backup 產生私有本機 dump，**並未提供加密或異地保存**，不能直接當正式備份方案。正式需加密磁碟／物件儲存、獨立 backup role、短期憑證及異地保存。每次部署前、每日完整備份；如要 RPO 15 分鐘則採 managed PITR 或持續 WAL。

本機可重現命令（程式拒絕正式來源）：`npm run db:backup` → `node --import tsx scripts/verify-qbuy-migration.ts backups/<file>.dump`；驗證所有原欄位指紋、migration status 與零 drift。`node --import tsx scripts/verify-screenshot-restore.ts` 另外以非空合成付款截圖測試 bytea、SHA256 與交易關聯。只有 `--apply-development` 才將新增 migration 套到允許的 development DB。所有測試只清除其自行建立的隨機隔離資料庫。
