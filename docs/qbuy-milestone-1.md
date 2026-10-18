# QBUY 里程碑 1 操作與庫存契約

## Admin 操作

1. 在 `/admin/products/new` 建立商品（沿用商品驗證及權限）。
2. 在 `/admin/commerce` 選商品，新增「顏色」、「尺寸」維度及各選項。
3. 選定實際存在的組合建立 SKU；例如黑 S、白 M，無須建立黑 M、白 S。無規格商品可建立固定 UUID 預設 SKU。
4. SKU 可修改 code、顯示文字、啟停及配送資料；預設 SKU code 與身分不得變更。此介面不提供刪除或重寫組合。
5. 每個 SKU 使用「經核實的起始盤點」，輸入真實數量、原因並確認。任何未履約舊單會阻擋同商品的庫存切換。切換後同商品所有舊下單停止，未盤點的其他 SKU 仍不可販售。
6. 在既有「團購管理」建立草稿。在 `/admin/commerce` 選開團，加入 SKU 與團價／數量上限，設定分類、精選、排序及上架。
7. 分類可新增、改名、排序及停用；使用數包含歷史開團。沒有永久刪除操作。已截止開團不能改分類。
8. 庫存可補貨、減少及盤點調整；版本過期請重新整理。相同操作識別碼重送不會重複加庫存，異動紀錄保留時間、操作者、原因、前後數量及預留／占用量。「查看完整庫存流水帳」可逐頁查閱所有較早紀錄。

## 顧客驗收

建立 A／B 團共用同 SKU，分別定價 299／279，實體盤點 20。在首頁依商品名稱搜尋，分別進入兩團各加 1 件，購物車有效小計應為 578；兩團都顯示可售 20，加入購物車不改庫存。

將其中一團改價，購物車重新驗證後保留該行並標示「價格已變動」，接受新價後才恢復計入小計。同 SKU 合計需求超過可售量時，相關行都不可計入有效總額。下架、截止、封存及停售同樣保留不可購買狀態。

本機購物車只保存 offer UUID、數量與比較價格，無私人資料。LINE 導向、重新載入及登出不清除 localStorage。每次回到購物車、視窗重新取得焦點或跨分頁變更都會重新驗證。實際 LINE 成功登入需要既有正式開發通道設定；自動測試使用真實拒絕回呼及隔離顧客 session，沒有冒充第三方成功驗證。

## 資料庫演進與起始庫存

`20261018090000_qbuy_commerce` 僅新增欄位、表及保護，保留既有 16 個 migration、歷史 Order／OrderItem／Shipment、商品及 SKU UUID。沒有從 GroupBuyItem.stock 轉入任何庫存，也沒有自動開啟共用庫存。

先執行唯讀報告：

```powershell
node --import tsx scripts/inspect-inventory-transition.ts
```

此工具只接受既有白名單本機／CI 資料庫。它列出每商品 SKU 數、原始 stock（保留 null）及未履約舊單數，絕不加總或推算實體數量。2026-10-18 起始報告有 1 商品、3 個 stock=null 引用、14 個未履約舊單明細，因此現有商品應保留舊權威，完成履約／取消及實體盤點後再由 Admin 切換。

`Product.skuInventoryEnabled=false` 時維持原舊單機制。首筆成功 INITIAL 與 Product 切換在同一 transaction；兩者與所有舊 OrderItem INSERT 共用 Product row lock。切換後 DB trigger 及舊下單服務都拒絕新舊單混用，公開舊表單也排除此商品。舊訂單付款、取消、履約與歷史庫存回補仍使用既有服務；切換前要求處理未履約單，避免舊回補影響新庫存權威。不得手動把權威改回 false。

新增模型：Category、GroupBuySku、SkuInventory、InventoryMovement。FK 採 Restrict 保護引用；ledger 不允許更新或刪除。Category、offer、SKU 以停用保留身分。SKU 的商品與規格組合在被販售／庫存引用後禁止變更。

## 庫存算式與里程碑 2 契約

`available = onHand - reserved - allocated`

DB CHECK 要求三者非負且 reserved + allocated 不超過 onHand。Admin 所有異動取得 Product row lock，在同一 transaction 更新 balance、版本與 append-only ledger。盤點要求 expectedVersion，過期操作拒絕而非覆寫；requestId 保證重送冪等。Admin 不得以補貨或盤點直接清除預留／占用。

後續 Checkout 必須以同一交易的條件 UPDATE（available >= quantity）或相同鎖協定操作：

| 事件 | onHand | reserved | allocated |
| --- | --- | --- | --- |
| Checkout 預留 | 不變 | +q | 不變 |
| 付款確認 | 不變 | -q | +q |
| 實體出庫 | -q | 不變 | -q |
| 未付款取消／逾期 | 不變 | -q | 不變 |
| 已付款未出庫取消 | 不變 | 不變 | -q |
| 已出庫後退款 | 不自動回補 | 不變 | 不變 |
| 驗收實體退回 | +q（一次） | 不變 | 不變 |

以上是後續服務的約束，里程碑 1 不實作預留、核帳、出庫或退回狀態機。實作時需建立對應 Checkout／Order／Shipment 快照引用與事件冪等鍵、擴充 ledger 的預留及占用前後欄位；不得同時在付款與出庫各扣一次 onHand。價格以正式成交快照保存，不能讀 GroupBuySku 最新價格改寫舊交易。

SKU 配送資料表達溫層、候選配送方式（7-ELEVEN／全家／宅配）、重量、尺寸及限制；空方式代表尚未確認，不代表任意配送。GroupBuy 預設允許合併配送，購物車重驗回傳相容資訊；真正分組與物流可行性待 Checkout 再驗證。本期無貨到付款或物流商實際寄件操作，SELF_PICKUP 歷史 enum 不變。

## 驗證

```powershell
npx prisma validate
npm run lint
npm run typecheck
npm run test -- --maxWorkers=2
npm run test:integration:orders
npm run test:e2e
```

整合 runner 建立單次 PostgreSQL sibling DB、套用全套 migrations、跑舊訂單／物流／SKU 與新 commerce 測試後清理。E2E runner 建立另一隔離 DB，production build／start 後以 Chromium 驗收。`e2e/qbuy-milestone-1.spec.ts` 透過 UI 建立商品、多規格、盤點、分類、兩團價格及上架，截圖寫在 test-results。測試中的顧客 session 為隔離 fixture；不需真實 LINE 帳號。unit 預設 skipped 的 integration 必須另外跑，不能當成通過。
