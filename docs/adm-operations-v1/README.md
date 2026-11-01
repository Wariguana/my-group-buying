# QBUY ADM 第一輪工作台與真實測試訂單

2026-11-01 · 提交供人工驗收，保留 Draft，未合併或部署。

## 範圍與操作入口

| 路由 | 用途與改善 |
| --- | --- |
| `/admin` | QB 優先的工作總覽：八項待辦、台北日期的今日新增購買／正式訂單、實際配送群組數、最近正式訂單、常用操作。各待辦可能重疊，不能相加。 |
| `/admin/qbuy?view=purchases` | 購買紀錄：顧客、商品快照、金額、已確認入帳、目前配送與退款狀態、下一步。手機卡片、寬螢幕緊湊分欄。 |
| `/admin/qbuy?view=orders` | 正式 QB 訂單：只列真正成立的 QbOrder。支援姓名、電話、編號、團購／商品查詢及正式訂單狀態。 |
| `/admin/qbuy/[id]` | 摘要 → 商品與規格 → 付款 → 配送 → 取消／退款 → 進階操作紀錄。保留銀行入帳、建單、取消審核、退款、物流、退回、品檢與重寄操作。 |
| `/admin/qbuy/notifications` | 保留經核實的 LINE 通知對象管理；每筆交易的通知與重試仍在詳情進階區塊。 |
| `/admin/payments?settings=1#settings` | 直接打開既有銀行與配送設定。核帳工作流程保留，僅補必要用語、參數防護與表單回饋。 |
| `/admin/preview/orders` | PR #77 的純 UI 靜態預覽，保留作參考；不是這次的真實測試資料。Production 不提供此頁。 |

桌面固定側欄、手機原生 modal dialog 抽屜。背景為 inert，鎖定捲動；Tab 循環、Escape／背景／關閉按鈕、返回焦點與跨桌面斷點清理均有測試。選單標示目前頁面，操作保留 focus-visible。登入品牌統一為 QBUY。

消費者 UI、Prisma Schema／Migration、價格、金融及物流狀態機、Auth、伺服器交易權限均未修改。共用表單只補前端重複送出保護、已確認回應後換操作鍵、失敗保留操作鍵、台北時間輸入及可讀錯誤。

## PR #77 審查與分支基準

- 原工作目錄：`codex/qbuy-ui-streamline-20261029`，`69731b9fc3e5cd9b78849494856fc85cf89bfc23`，有既存大量未提交工作，未覆蓋。
- `origin/main`／已合併 PR #76：`ac64dba6d2f1a5eefca7a49132e72e693de7e3fd`。
- PR #73 → #74 → #75 是尚未合併的混合 UI 分支鏈，本輪沒有合併或整包 cherry-pick。
- PR #77 是從上述 main 建立的獨立 ADM Draft，HEAD `2efc98cead5b66a616908ca010e839d63aecde1b`，14 個差異檔案。本輪先審查，重用 QB 投影、雙視圖、靜態預覽與既有操作，再在新 worktree `D:/qbuy-adm-workspace`、新分支 `codex/adm-operations-v1-20261101` 修正；未改寫 #77。

| #77 審查發現 | 本輪處理 |
| --- | --- |
| 抽屜開啟後切到 Desktop，隱藏節點仍可能鎖住 body／攔截鍵盤；aria-modal 本身沒有隔離背景 | 原生 dialog＋背景 inert、明確 Tab 循環；1024px 斷點關閉並清理捲動鎖。 |
| `searchParams.q.trim()` 假設一定是單字串，重複 query key 可造成錯誤 | 單值正規化、允許清單、分頁整數與上限；重複 key、未知狀態有測試。 |
| 列表每筆載入完整生命週期、稽核與通知，20 筆時資訊和表單過多 | 列表使用精簡投影；獨立詳情載入操作與稽核。保持明確返回查詢條件。 |
| `shipmentGroups` 實為 Checkout 數；跨團取消時，另一筆 PAID 訂單可能讓已取消群組被計入 | 同時關聯 checkoutId 和 groupBuyId 的唯讀查詢，排除無有效待履約商品的群組。顯示配送群組數與涉及購買數，列表用相同定義。 |
| 歷史 RETURNED／VOIDED 已有新物流仍計為異常 | 異常佇列只列同一配送群組尚無有效替代物流者。重寄列表顯示目前物流及重寄標記。 |
| 最近正式訂單把 COMPLETED 顯示為一般成立 | 改用真實正式訂單狀態。 |
| 28＋16 張靜態卡片無法驗證真實操作／資料關聯 | 新建持續存在的本機隔離資料庫，30 筆 Checkout 由既有交易服務建立。 |

原始 #77 紀錄見 `docs/adm-workspace-v1-review.md`；其中標示的首次預覽限制由本文件補充，不能當成這輪完成狀態。

## 本機啟動

既有 `.env` 只作為已核實本機 PostgreSQL 連線來源；允許 loopback 5433 的 `my_group_buying_dev`（CI 可用 5432 的 `ci`）。**不在來源資料庫 seed**。

```powershell
cd D:\qbuy-adm-workspace
npm ci
npm run prisma:generate
npm run adm:preview:seed
npm run adm:preview
```

開啟 `http://127.0.0.1:3200/admin`。帳號為 `adm-preview@example.invalid`，每次新建環境產生隨機密碼；執行 `npm run adm:preview:info` 查看本機登入資訊。密碼與資料庫擁有權僅在已忽略的 `.temp/adm-preview/manifest.json`，不得上傳。

```powershell
npm run adm:preview:verify  # 真實資料與佇列、庫存關聯檢查，不寫入交易
npm run adm:preview:test    # Chromium 六種尺寸與 30 筆詳情；必要時自動啟動 3200
```

第二次 seed 會重用完成環境，不重複新增或覆蓋。初次建立約需兩分鐘：物流團必須在真實時間截單，才呼叫既有 createShipment。沒有 fake clock、回填交易狀態或取消安全驗證。

不需資料時，先停止此預覽，再明確執行 `npm run adm:preview:clean`。僅刪除隨機 `my_group_buying_e2e_<32 hex>` 名稱、限定 loopback，且 PostgreSQL 資料庫擁有權 COMMENT 與本機 manifest 完全相符的目標。來源開發資料庫永不清空。建立中斷時保留不完整 manifest，不自行覆蓋；先確認後 clean，再 seed。

所有資料是合成顧客、假門市與假銀行參考。商品初始庫存由既有 INITIAL 帳務建立；購買、預留、入帳、建單、取消、退款、出貨扣庫、退回與重寄均走原業務服務。`QBUY_ENV=test` 且 LINE_PUSH／LOGISTICS_EXTERNAL 強制 false，不啟動 worker，不呼叫真實銀行、物流或 LINE。7-ELEVEN 選店沿用 token／binding 服務，使用明確注入的本機假門市解析器。

## 30 種情境

| 編號 | 情境 |
| --- | --- |
| 01–02 | 尚未付款；7-ELEVEN 尚未付款 |
| 03–04 | 顧客已回報轉帳；全家等待核帳 |
| 05–06 | 付款不足；付款資料異常 |
| 07–08 | 已確認銀行入帳、尚待建立正式訂單 |
| 09 | 正式訂單、等待截單 |
| 10 | 一次購買、兩筆 QB 訂單、共用配送群組 |
| 11 | 同一 QB 訂單、常溫與冷藏兩個配送群組 |
| 12–18 | 已截單待物流、物流建立、交寄、運送中、全家到店待取、送達、完成 |
| 19–21 | 取消待審、核准待退款、拒絕 |
| 22–24 | 退款處理中、已退款、退款失敗 |
| 25–30 | 物流退回、實收包裹、品質異常、待收重寄費、已收重寄費、重寄運送中 |

共 **30 Checkout／23 QbOrder／31 FulfillmentGroup**。測試商品含長名稱、多 SKU、缺圖、不同售價／運費、宅配／全家／7-ELEVEN。20 筆分頁可切到第二頁；查詢 `ZZZ沒有這筆訂單` 可看空資料畫面。這些狀態是初次建立的結果；實際操作會合法改變資料，欲重設需明確 clean → seed，不能用 seed 覆蓋。

## 驗證與人工驗收

CI 亦執行 seed → verify → 六尺寸 Chromium，並在結束時檢查擁有權後清理專屬資料庫；CI 不列印隨機登入密碼。

完整結果與截圖見 [驗證記錄](verification.md)。瀏覽器報告位於 `.temp/adm-preview/report/index.html`，可用 `npx playwright show-report .temp/adm-preview/report` 開啟。截圖只含隔離合成資料。

請先人工確認工作總覽的資訊順序、手機訂單卡片、詳情的操作層級與用語。這輪沒有重構商品、團購、完整付款工作台或物流工作台；這些仍是後續可逐頁驗收的範圍。

舊制 `/admin/orders` 與 `/orders/[publicCode]`、Order schema、服務和測試均保留。庫存切換仍依賴舊未履約訂單檢查，歷史訂單、取貨和物流功能仍使用舊服務；目前不宜直接刪除。退役需另外盤點歷史資料、相容路由及庫存守門條件。
