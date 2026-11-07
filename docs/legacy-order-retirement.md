# 新版 QBUY 與舊訂單流程退役

現行開發以 SKU → 購物車 → Checkout → 人工核帳 → QbOrder → 取消、退款與配送為準。所有修改直接位於專案根目錄；本機執行 `npm run dev` 後使用 `http://localhost:3000`。

## 已移除的程式入口

- `/admin/orders`、`/admin/orders/[publicCode]` 舊管理頁及其付款、取消、取貨與物流 actions。
- `/orders/[publicCode]` 訪客查單、存取碼與直接取消流程。
- 團購詳情頁的舊單團直接下單表單及 action；僅使用 SKU 加入購物車。
- `/my/orders` 的舊 Order 列表；目前只查詢 Checkout 與 QB 訂單。
- 舊 Order／Shipment 專屬服務、驗證、重試與測試。舊 Phase 1 瀏覽器腳本改為仍適用的商品與團購基本資料驗收。
- 團購基本資料頁的舊商品與固定取貨操作；販售內容由商品規格與庫存管理。發布與已發布儲存均檢查有效、已盤點 SKU。
- `/admin/pickup-locations`、新增／編輯取貨地點及其專屬服務、驗證與測試。新版配送由 7-ELEVEN、全家與宅配設定管理，不再提供舊固定據點設定。
- 未使用的舊 Order dashboard、團購商品／取貨選項 loader、舊發布錯誤碼，以及已不存在下單 action 的 production POST 封鎖分支；商城開放旗標仍保留。
- 協助中心對舊查單與舊自助取消入口的指引，改為現行 LINE 帳號、Checkout 與 QB 流程。
- 商城搜尋、最低售價、價差與售完狀態不再混入舊 GroupBuyItem；只以現行 SKU 販售規格判斷，避免已退役的價格或庫存影響新版畫面。

上述舊訂單網址預期回應 404，不導向其他訂單，避免把不同編號與資料模型混用。後台主要入口為 `/admin/qbuy` 與 `/admin/payments`。

## 保留且仍必要的部分

- 歷史 Order、OrderItem、Shipment、GroupBuyItem、GroupBuyPickup 與其他資料表、資料及已套用 migration。沒有 schema 變更、資料轉換或刪除。
- SKU 切換時檢查歷史未履約資料的守門條件；不能為了顯示新版而略過歷史庫存保護。
- 共用交易衝突判斷移至 `src/lib/db/transaction-conflict.ts`；QB 編號所需臺灣營業日期移至 `src/lib/checkout/order-date.ts`。
- 新版結帳仍使用的 7-ELEVEN 選店、身分與瀏覽器綁定、防重播及門市核實。它不等於舊 Order 物流服務。
- 團購既有歷史商品、固定取貨關聯與自取設定完全由伺服器保留。基本資料表單不再回送這些隱藏欄位；strict schema 拒絕注入，更新不新增、改寫或刪除歷史關聯。新建團購明確關閉舊自取設定。
- `/admin/preview/orders` 是使用新版 Checkout／QB 卡片的開發畫面範例，沒有舊 Order 查詢或寫入；它仍維持正式環境不可用。
- `.env.example` 的 ECPay、LINE、儲存與部署旗標仍供新版使用，沒有為清除舊制而移除共用設定。

## 現行導覽與交付文件

桌面與手機「更多」目前共有 8 個次要入口：正式 QB 訂單、付款確認、團購管理、商品規格與庫存、供應商管理、銀行與配送設定、通知對象、系統狀態。

ADM 瀏覽器測試依現行導覽清單核對全部入口，不再硬編碼舊版的 10 個數量；也明確確認舊訂單與固定取貨設定不出現在導覽，退役網址回應 404。

`docs/adm-shell-uiux-20261106` 及 `docs/adm-operations-v1` 的原截圖、數量與 checksum 是歷史交付快照，不代表清理後的最終畫面或測試結果。最新驗證另見 [舊制清理驗證紀錄](legacy-retirement-verification.md)。

## 驗證方式

`npm run check` 執行 lint、typecheck、單元測試與 build。`npm run test:e2e` 覆蓋現行購買流程、舊網址 404、SKU-only 已發布團購修改、手機銀行欄位錯誤、未儲存離開與返回提示、320px 核帳表單邊界。`npm run test:integration:commerce` 保留 SKU、庫存、Checkout、QB 生命週期與營運整合測試。

資料庫整合及 E2E 使用專案既有 runner 的暫存資料庫保護機制，不能將寫入測試改指向日常或正式資料庫。這不會另建專案工作區，也不影響從專案根目錄執行日常開發。

ADM 預覽使用同一份原專案程式，僅把 Next 編譯快取分開放在 `.temp/adm-preview/next`，因此 3200 驗收可與日常 3000 開發服務並存。此設定只在預覽 runner 的 development 程序啟用，正式 build 不受影響。
