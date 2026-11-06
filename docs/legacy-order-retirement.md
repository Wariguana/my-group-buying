# 新版 QBUY 與舊訂單流程退役

現行開發以 SKU → 購物車 → Checkout → 人工核帳 → QbOrder → 取消、退款與配送為準。所有修改直接位於專案根目錄；本機執行 `npm run dev` 後使用 `http://localhost:3000`。

## 已移除的程式入口

- `/admin/orders`、`/admin/orders/[publicCode]` 舊管理頁及其付款、取消、取貨與物流 actions。
- `/orders/[publicCode]` 訪客查單、存取碼與直接取消流程。
- 團購詳情頁的舊單團直接下單表單及 action；僅使用 SKU 加入購物車。
- `/my/orders` 的舊 Order 列表；目前只查詢 Checkout 與 QB 訂單。
- 舊 Order／Shipment 專屬服務、驗證、重試與測試。舊 Phase 1 瀏覽器腳本改為仍適用的商品與團購基本資料驗收。
- 團購基本資料頁的舊商品與固定取貨操作；販售內容由商品規格與庫存管理。發布與已發布儲存均檢查有效、已盤點 SKU。

上述舊訂單網址預期回應 404，不導向其他訂單，避免把不同編號與資料模型混用。後台主要入口為 `/admin/qbuy` 與 `/admin/payments`。

## 保留且仍必要的部分

- 歷史 Order、OrderItem、Shipment、GroupBuyItem、GroupBuyPickup 與其他資料表、資料及已套用 migration。沒有 schema 變更、資料轉換或刪除。
- SKU 切換時檢查歷史未履約資料的守門條件；不能為了顯示新版而略過歷史庫存保護。
- 共用交易衝突判斷移至 `src/lib/db/transaction-conflict.ts`；QB 編號所需臺灣營業日期移至 `src/lib/checkout/order-date.ts`。
- 新版結帳仍使用的 7-ELEVEN 選店、身分與瀏覽器綁定、防重播及門市核實。它不等於舊 Order 物流服務。
- 團購既有歷史商品與取貨關聯由基本資料表單保留，不因移除操作介面而清空。
- `/admin/preview/orders` 是使用新版 Checkout／QB 卡片的開發畫面範例，沒有舊 Order 查詢或寫入；它仍維持正式環境不可用。

## 驗證方式

`npm run check` 執行 lint、typecheck、單元測試與 build。`npm run test:e2e` 覆蓋現行購買流程、舊網址 404、SKU-only 已發布團購修改、手機銀行欄位錯誤、未儲存離開與返回提示、320px 核帳表單邊界。`npm run test:integration:commerce` 保留 SKU、庫存、Checkout、QB 生命週期與營運整合測試。

資料庫整合及 E2E 使用專案既有 runner 的暫存資料庫保護機制，不能將寫入測試改指向日常或正式資料庫。這不會另建專案工作區，也不影響從專案根目錄執行日常開發。
