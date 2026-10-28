# QBUY 品質收斂驗收

驗收期間：2026-10-28 至 2026-10-29（Asia/Taipei）。基準 main：`0c76ed5a8f552c8de01bbc25ca8cd4ade79496f4`。

本次交付是可審查的本機工程與隔離驗收成果。正式上線判定仍為 **NO-GO**；銀行、物流、LINE、正式雲端、外部 Staging、條款及營運責任等依賴尚未驗收。未購買資源、未部署 Production、未進行真實交易或推播。

## UI／UX 改善

|原行為／問題|交付後行為|
|---|---|
|顧客、Admin 仍混用舊品牌及不同主按鈕|QBUY 快易購／快易購營運管理；沿用共用元件，建立品牌、狀態、字體、間距、焦點與觸控規範|
|登入後長名稱擠壓手機頁首|手機隱藏長顯示名稱，保留購物車、我的訂單、登出；可換行且不撐寬|
|SKU 商品同時顯示「0 項商品／目前沒有可訂購商品」|按實際規格數顯示，移除與可購規格矛盾的舊制空狀態|
|切換分類／精選／已結束會遺失搜尋條件|篩選連結保留其餘條件，有選取標示與清除篩選入口|
|Checkout 同時要求不相關配送欄位，只顯示總運費|依配送方式顯示欄位；確認前逐組列商品、溫層、免運門檻、運費、最晚截止等待|
|付款／退款下一步不清楚；已退款仍可能顯示尚未執行|回報、入帳待建單、正式訂單、逾期與退款狀態分別說明；取消與退款分離|
|物流連續操作沿用同一 requestId，第二事件遭拒|收到成功確認才換 key；不確定／失敗保留 key 安全重試；同步 ref 防止同輪重送|
|銀行時間按瀏覽器所在地轉換；日期錯誤可脫離錯誤處理|固定按臺灣 UTC+8 解析，輸入及稽核清楚標示；洛杉磯時區另外驗證|
|Admin 長選單使 390px 撐到 540px；非空首頁表格隱藏表頭也會越界|限制選單容器，表格採相對定位且僅容器水平捲動，加入鍵盤可聚焦捲動區|
|未核帳／未截止／取消待審仍顯示建物流表單|顯示阻擋原因與下一步；只有基本展示條件符合才提供操作，服務仍交易內重驗|
|成功建立購買後返回可誤認尚未下單|確認成功才清除相符購物車行；保留其他分頁新增／改量商品；儲存清理失敗不遮蔽已成功交易|
|非 JSON 或斷線回應只有原始例外|共用中文錯誤提示，提醒先確認紀錄、勿重複付款；成功／錯誤有不同無障礙公告|

範圍涵蓋商城、商品詳情、購物車、Checkout、付款回報、我的訂單、取消退款配送頁、Admin 登入／商品規格庫存／核帳／履約及既有歷史訂單表格。設計規則見 [UI Guidelines](ui-guidelines.md)。沒有新增 UI 框架。

## 實際操作成果

- M1：Admin UI 建立商品、多規格、分類、盤點、共用 SKU 與跨團價格；顧客搜尋、選規格、加購、改價、截止／停售／合計庫存不足與 OAuth 拒絕返回。
- M2：顧客跨三團購買、逐組報價、私有付款截圖、Admin 模擬銀行核帳、三張 QB 訂單、我的訂單彙總，再經 UI 重新加購並使用已核實全家門市。
- M3：取消申請、審核、340 元模擬退款、顧客頁確實顯示已退款；合併交寄／送達；另一筆退回、實收、品檢、60 元模擬重寄費與新物流。連續物流事件不靠每次重新整理才能操作；重寄不再扣庫。
- 新三尺寸案例：390／768／1440px、長姓名／團名、鍵盤跳至主內容與 Enter 報價、慢速雙擊、重新整理、瀏覽器返回／前進。建立一次購買、兩件預留；加入購物車本身不預留。顧客與四個主要 Admin 入口均無整頁水平溢出及未處理 pageerror。
- LINE 成功登入使用隔離 session；銀行入／退款、物流及通知 adapter 均為合成證據，沒有當成真實外部驗收。

## 架構與交易邊界

保留 App Router、React、TypeScript、Prisma、PostgreSQL、新舊 Order 邊界與所有交易核心。Checkout service 僅擴充安全報價 projection，不向客戶端傳內部能力證據。共用付款顯示文案及 JSON 錯誤處理，逐步減少重複狀態／表單處理；未全面重寫庫存、核帳、取消或物流 service。

Prisma schema 與既有 22 個 migrations 完全沒有修改。原始 development 未套 migration、未重設或回填；最終仍為 22 migrations、18 張舊 Order、18 筆 OrderItem、0 張 QbOrder。所有新測試、故障注入及容量資料都在自建隔離 DB，驗收結束後已確認沒有測試 DB 遺留。

## 已執行驗證

下表列本機實測。Skipped 不計為 passed；交易及 Auth runners 另外啟用相關整合案例。

|命令／驗證|結果|本機執行證據|
|---|---|---|
|npm run lint|0 error／0 warning|`.temp/lint-acceptance.log`|
|npm run typecheck、npx prisma validate|通過|`.temp/typecheck-acceptance.log`|
|npm run test -- --maxWorkers=2|1,971 passed、163 skipped|`.temp/unit-acceptance.log`|
|npm run test:integration:orders|166 passed、0 skipped|`.temp/integration-acceptance.log`|
|npm run test:integration:auth|23 passed：2 個真 PG 案例＋21 個安全 guard；0 skipped|同上；已納入 CI|
|洛杉磯 TZ 的交易表單測試|7 passed|`.temp/timezone-forms.log`|
|npm run test:e2e|Chromium 23 passed、0 skipped，包含 production build|`.temp/e2e-acceptance.log`|
|npm audit（完整含 dev）|0 vulnerabilities|`.temp/audit-all-fixed.json`|
|Linux Docker build|通過，Next 16.4.1，全部修補後依賴|`.temp/docker-acceptance.log`|
|合成私有截圖 dump/restore|SHA256、PNG decode、付款關聯與金額通過|`.temp/screenshot-restore.log`|
|PG17 容器故障與回退相容|22 migrations、失敗 migration 阻擋、預設關閉、DB503／恢復、worker kill／恢復、M3 舊程式對新增 schema 相容皆通過|`.temp/container-acceptance.log`|
|遠端 CI／Security|以本 PR **最後 HEAD** 的 checks 與最終交付訊息為準；不能拿舊 SHA 成功替代|GitHub Actions|

交易 runner 涵蓋最後一件競爭、跨團 SKU 合計、全成全敗預留、六小時／已回報保留、少匯多匯、入帳後建單失敗留存、重複核帳建單、取消與建物流共享鎖、取消後免運門檻、同 QB 多群組、退回不回補／重寄不重扣、通知失敗不回滾主交易、worker 互斥與恢復、ownership／CSRF／舊資料相容。Auth runner 補上原先未由主 runner 啟用的 bootstrap 與 session 持久化測試。

## 安全修補

即時掃描發現交接版本之後的公告，必要更新為 Next 16.4.1／eslint-config-next 16.4.1、Zod 4.6.6、Vitest 4.1.12；fast-uri、Vite、Undici、brace-expansion 只在原有範圍內更新 lock。沒有新框架、ORM 或資料庫。完整 npm audit 已歸零，CI 增加 audit gate。公告與適用性見 [安全審查](production-security-review.md)。這不是外部滲透測試或「不存在所有漏洞」的保證。

## 本機容量與部署

安全修補後服務＋PG 報價／建立 Checkout：1／5／10 併發分別完成 4／20／40 筆，p95 75／175／308ms；共 64 筆，onHand=100、reserved=64、allocated=0，無正式 QB 單，量測程序 peak RSS 233 MiB。來源 `.temp/capacity-acceptance.log`；只含本機 Node service＋PG，不含 HTTP、瀏覽器、雲端與第三方延遲。

容器限制 web 1536 MiB／1.5 CPU、checkout worker 384 MiB／0.25 CPU、測試 PG 768 MiB／0.5 CPU。故障演練後觀測約 188／111／42 MiB；20 並行 readiness p95 46ms。這是故障／健康端點量測，不能當成 4 GiB SGP1 正式交易容量。M3 舊映像只做隔離相容性演練，已知漏洞版本不可作正式回退候選。

預算維持 Production＋按需 Staging 合計 NT$1,500–2,500；來源、假設及風險見 [正式架構與成本](production-architecture.md)。真實網路、DB連線上限、備份成長、稅費／匯差、Staging 計費及供應商 PITR 尚需核准及實測。

## 截圖與重現

固定副本與 SHA256 索引位於 [evidence/2026-10-29](evidence/2026-10-29/README.md)。保留手機／平板／桌面報價、手機付款、Admin、核帳、三張 QB 訂單、退款配送與退回重寄。全為隔離合成資料。修改前差異以基準 commit 的原始碼為準，沒有捏造修改前截圖。

在本分支 root 設定允許的本機 development URL 後，依序執行：

```powershell
npm ci
npm run lint
npm run typecheck
npx prisma validate
npm run test -- --maxWorkers=2
npm run test:integration:orders
npm run test:integration:auth
npm run test:e2e
npm run test:capacity:local
node --import tsx scripts/verify-screenshot-restore.ts
docker build --tag qbuy:quality-local .
node --import tsx scripts/verify-container-readiness.ts qbuy:quality-local qbuy:milestone-3-rollback
```

最後一項的舊映像須事先保留；沒有時可省略第二個 image 參數，不能把未執行的回退驗證算成功。截圖每次執行的 UUID、編號與時間會不同，流程與輸出位置可重現。

## 失敗輪次與剩餘事項

保留首輪沙箱暫存／loopback 權限失敗、錯誤 fixture slug、select 無障礙名稱、長選單與非空表格溢出、容量腳本 NODE_ENV／型別，以及舊回購測試依賴已購商品仍在購物車的診斷紀錄。皆已定位修正，未計入通過。pg 8 的既有並行 query deprecation 仍為非失敗警告；未升級 pg 9。

原始 `D:/my-group-buying` main 保持乾淨；工作在獨立 `codex/qbuy-quality-20261028`。檢閱 `git diff 0c76ed5...HEAD`；最終 SHA 與最後 HEAD 的遠端檢查結果列在交付訊息。

正式 **NO-GO**：仍需核准銀行實收／退款、物流交寄／簽收／退回、LINE 真實 OAuth／推播及封鎖、客服 URL 與值班、實體盤點、正式條款／個資政策、雲端／網域／R2／PG17、外部備份恢復與監控接收人、真實外部 Staging 及容量。逐項責任與驗收方式見 [Go-Live Dependency Matrix](go-live-dependencies.md)。沒有背景自主程序在交付後繼續開發；本地可執行驗收與正式上線授權分別記錄。
