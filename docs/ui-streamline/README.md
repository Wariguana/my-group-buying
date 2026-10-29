# QBUY 全站精簡重構與整合驗收

2026-10-29，Asia/Taipei。本次本機完整驗收通過；實際結果見下方驗證表。最終 commit SHA 與該 HEAD 的遠端 CI／Security 結果列於交付訊息及 PR checks。

## 基準與資料邊界

- Repository：`Wariguana/my-group-buying`，工作目錄 `D:/my-group-buying`。
- 起始 HEAD／安全 checkpoint：`1d06c7a1db0f8ca7ddcf40a938a053179bb168fd`，原工作樹乾淨。新分支 `codex/qbuy-ui-streamline-20261029`，原分支保留。
- 已重新 fetch origin。main／origin/main 皆為 `0c76ed5a8f552c8de01bbc25ca8cd4ade79496f4`。GitHub API 確認 PR #73 仍 open、未合併，HEAD `ccbc461198789b4ff351f1ae9866df6c06a2585d`；本次基準包含它與後續 UI 修正。
- Prisma schema、22 個 migrations、依賴規格及 lockfile不變。交易、庫存、核帳、取消、退款、物流、通知服務與安全判斷不重寫。
- 所有新增測試資料與故障注入均在 runner 自建的隨機隔離 PostgreSQL。沒有讀寫 Production、重設 development、真實匯退款、寄件、LINE 推播、購買資源或部署。

## Code Review 與實作

全站盤點包含 29 個頁面、13 個 Route Handlers、365 個 JSX 互動來源位置、所有共用互動元件與 Server Actions。全站 AST 檢查、型別檢查、Lint、單元及既有交易／權限測試提供橫向檢查；人工重點檢閱本次差異、頁面入口、狀態分支、唯讀資料 projection 及交易邊界。

|問題|本次處理|保留的功能與安全約束|
|---|---|---|
|首頁重複購物車／訂單入口|移除內容導覽的重複項目；Header 保留購物車、登入後我的訂單與登入／登出|未登入先透過既有 LINE 登入，登入後訂單入口可達；不改 OAuth 或訂單授權|
|首頁層級與空白|縮短 Hero；搜尋為唯一主要操作，商品卡及分類採共用次要按鈕；無精選資料不建立空區塊；未設定篩選時不提供無效清除按鈕|精選排序、公開資格、售完、截止、分類與查詢規則不變|
|空購物車同時驗價／顯示結帳提示|載入、成功空狀態、錯誤、有商品四個呈現互斥；空狀態只有「繼續購物」；移除不適用的登入提示；錯誤有安全重載|每次載入仍驗價；保留 revision、防舊回應、跨分頁更新、數量、移除確認、接受新價、跨團 SKU 合計及資格驗證|
|待付款頁 CTA 權重|尚待付款時將取消／退款／配送入口降為次要|付款回報、六小時期限、歷史 snapshot 與退款文案不變|
|Admin 導覽混雜|依五個工作領域分組；手機提供鍵盤可操作的展開選單；桌面 Sidebar 可獨立縱捲|10 個原有目的地全部保留；新增的設定入口指向原核帳頁已存在的設定 disclosure|
|新舊訂單難辨|Sidebar 與舊制列表標明「舊制」；首頁分開顯示 QB 與舊制統計／最近紀錄|舊 Order 路由、狀態機、歷史資料與操作均保留|
|營運首頁只看舊制，待辦與統計重複|待辦優先，顯示非零的核帳、付款異常、建單、退款、取消阻擋、物流及退回工作；再顯示今日摘要、最近 QB 訂單、收合的舊制待辦及次要新增入口|待辦以本次購買計數，明示可能重疊；日期固定臺北；讀取失敗不可顯示零或無待辦|
|監控大量零值與技術文字|健康摘要→實際待辦→預設收合的完整診斷；所有 11 指標、兩個 Worker、成功時間、錯誤碼及 LINE 開關保留|完全沿用原計算與閾值；區分零件、無心跳資料、未執行、失聯、失敗、讀取失敗／未知；真實 table lock timeout 驗證錯誤及重試|
|四個空列表重複新增按鈕|商品、開團、供應商、取貨點只保留頁首新增入口|原新增路由及全部表單可達；空狀態明示頁首入口|

資料層只新增 Admin 唯讀 projection；抽出原工作佇列篩選讓首頁與原工作台共用，條件內容不變。`operationalHealth` 只增加 `hasRecord` 顯示資訊，未修改健康、aging、Worker 或佇列計算。沒有價格、庫存、交易狀態或權限改由 Client 決定。

## 導覽與共用設計規格

|分組|實際入口|
|---|---|
|總覽|營運首頁 `/admin`|
|訂單與交易|QB 訂單、取消退款與履約 `/admin/qbuy`；銀行轉帳核帳 `/admin/payments`；舊制訂單 `/admin/orders`|
|商品與開團|團購、商品、SKU／分類／庫存、供應商|
|營運設定|取貨地點；銀行與配送 `/admin/payments?settings=1#settings`（直接展開既有設定）|
|系統管理|平台監控 `/admin/operations`|

沿用 [Design System](../ui-guidelines.md)：品牌 `#92400e`、底色 `#fafaf9`、Geist／繁體中文系統字型、16px 欄位、14px／600 按鈕、44px 操作範圍、8px 控制圓角、12px 卡片、明確焦點／disabled、語意 Badge、Error／Success／Empty／Loading。Primary 表示當前主要步驟，Secondary 表示導覽／補充操作，Danger 保留於需確認的破壞性操作，LINE 僅用既有登入。沒有新 UI 套件或局部覆寫按鈕規格。

## 逐頁與互動驗收

- [本版本逐頁狀態與尺寸](routes.md)、[路由／角色／權限來源矩陣](../ux-audit/routes.md)、[所有 JSX 互動清單](../ux-audit/interactions.md)、[機器可讀盤點](../ux-audit/inventory.json)。
- 29 頁正常狀態皆驗證 320／375／390／430／768／1024／1440px；適用首次空狀態另驗證七尺寸。真實 Loading／Error 邊界逐頁於 390px 注入。
- 操作涵蓋搜尋、分類、精選與結束頁、篩選／分頁、SKU／分類／庫存、CRUD、圖片、表單錯誤與保存中、不可逆確認、跨團購物車、改量／改價、配送切換、選店返回、報價、回報、核帳、取消撤回／審核／退款錯誤恢復、合併物流、退回實收／品檢／運費／重寄、通知安全重試及 ownership。
- 三尺寸實際購買流程另驗證慢速雙擊、單次建單／庫存預留、重新整理及前進返回。新選單／設定深層連結於五個指定尺寸操作鍵盤開關、導頁與收合。
- 原有罕見交易條件由隔離 PostgreSQL service／route 測試補足；操作與證據類型詳見 [既有案例分類](../ux-audit/cases.md)。來源列、截圖數、量測次數不當作獨立交易測試數。

## 實際命令與結果

|命令|本次結果|
|---|---|
|`node --import tsx scripts/ux-inventory.ts`|29 頁、13 handlers；盤點更新|
|`npx prisma validate`|通過|
|`npm run lint`|最終通過，0 error／warning|
|`npm run typecheck`|通過；E2E production build 亦再次檢查|
|`npm run test -- --maxWorkers=2`|2,036 passed；163 skipped 不計成功|
|`npm run test:integration:orders`|166 passed，0 skipped|
|`npm run test:integration:auth`|23 passed，0 skipped|
|`npm audit --json`|完整依賴 0 vulnerabilities|
|`npm run test:e2e`|Chromium 36 passed，0 skipped，4.3 分鐘；含 production build|
|`node --import tsx scripts/ui-streamline-evidence.ts`|通過；382 次狀態／尺寸觀察、270 張固定截圖及完整 JSON／SHA256；21 組手機／桌面主要畫面|
|`git diff --check`|通過|
|遠端 CI／Security|以交付訊息及本次最終 commit 的 PR checks 為準，不引用舊版成功|

production build 由 E2E runner 實際執行，所有 22 migrations 只部署到自建隔離 DB。既有 pg 8 並行查詢 deprecation 為非失敗警告，本次未升級依賴。首次遠端 CI 的 Chromium 階段失敗，但原 runner 隱藏瀏覽器輸出；CI 已啟用既有 `E2E_DIAGNOSTICS` 取得具體失敗案例，不以本機成功取代遠端驗收。

失敗輪次如實保留：Vitest 被 Windows 沙箱 Temp rename 擋住後，以允許權限重跑；新測試曾將 React Testing Library 的 role 查詢誤用 `exact`，型別錯誤已修正；可及名稱空白、選單名稱切換、同名 Sidebar／summary、Next route announcer 的定位均改為穩定／具範圍 locator；既有檢查工具會展開 details，新增選項保留預設收合截圖，而原全站控制檢查仍預設展開全部診斷。首兩輪 E2E 分別 33／35 passed、3／1 failed，不計完整成功；最終一輪 36 passed。Lint 曾遇到 Playwright 清理 test-results 時的遍歷競態，待 E2E 結束後重跑通過，未修改 lint 規則。沒有刪除交易斷言、放寬業務約束或把失敗／skipped 算成功。

## 證據與限制

[21 組手機／桌面主要畫面](screenshots.md) 及 [270 張固定截圖與 SHA256](evidence/index.json) 由通過的同一輪 Playwright 輸出匯整；保存手機／桌面 PNG 與完整各尺寸 JSON，其他尺寸 PNG 留在 `test-results/` 並可重現。所有人物、訂單、銀行與物流均為合成隔離資料；沒有捏造修改前截圖或逐像素比較圖。

這是列明流程、角色、時間與資料狀態的實際驗收，不是窮舉任意輸入或所有狀態組合。視覺回歸包含幾何／控制規格、平面文字對比、實際截圖人工檢視；沒有宣稱完整 WCAG AA 或未建立基準的 pixel-diff。實機手機、螢幕閱讀器與外部正式銀行／物流／LINE 驗收沿用 [外部依賴清單](../go-live-dependencies.md)。

本次列明驗收範圍沒有未修正的已確認 P0／P1 問題。其餘限制如上，不將本機通過延伸為外部正式上線完成。全部變更檔案見 [changed-files.txt](changed-files.txt)；最終 commit 可由此分支 `git log -1 --format=%H` 取得，並列在交付訊息。沒有在回報後繼續執行的背景開發工作。
