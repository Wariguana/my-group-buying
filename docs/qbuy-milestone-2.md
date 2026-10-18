# QBUY 里程碑 2：Checkout、人工銀行核帳與 QB 訂單

## 操作入口

- 顧客：商城／跨團購物車 → `/checkout` → 付款回報 → `/my/orders` 的「本次購買」。必須使用有效 LINE 顧客 session。
- Admin：`/admin/payments` 設定銀行、物流能力及費率；待核帳／異常佇列顯示 aging、金額差額、私有截圖、銀行交易及操作紀錄。全部購買與歷史頁可查看逾期及已成立訂單，每頁 50 筆。
- 核帳順序：查看銀行實際入帳 → 輸入唯一銀行交易參考號、金額、銀行時間、依據 → 二次確認 → 建立全部 QB 訂單。末五碼與截圖不會自動認列入帳。
- 少匯：逐筆登錄補差額，足額後才可建單。溢付：只按應付額成立，差額建立退款義務。
- 逾期已入帳：從全部購買登錄入帳，重新驗證庫存／原價／販售／配送條件後補單，或記錄退款義務。沒有無條件恢復預留、實際退款或物流寄送。
- 顧客無法更改已送出的回報。客服更正以 Admin「異常及更正稽核」附註保留原證據及操作紀錄。

## 模型及歷史相容性

新增 migrations `20261018150000_qbuy_checkout`、`20261018160000_verified_family_stores`、`20261018170000_checkout_store_selection`；前 17 個 migration 不變。開發與驗收只套用到 runner 建立並刪除的隔離 PostgreSQL sibling DB，未套用至現有開發 DB 或 Production。

新模型包含 Checkout、CheckoutItem、Payment、BankTransferReport、BankReceipt、FulfillmentGroup、QbOrder、QbNumberSequence、CheckoutAudit、RefundObligation、CheckoutOutbox、CheckoutSettings、ShippingRate、VerifiedPickupStore。

新制正式訂單使用 UUID 主鍵的 `QbOrder`，編號為 `QBYYYYMMDDNNNN`，與舊 `Order` 的付款／取消／履約服務隔離。舊 Order、OrderItem、Shipment、編號、查詢路徑及庫存權威保持原狀；新單統一由 Checkout 與我的訂單查詢。新單商品與配送／付款分攤均保存快照。這個邊界避免舊取消服務把新單的 allocated 誤作舊 GroupBuyItem.stock 回補。

InventoryMovement 新增 Checkout FK、beforeReserved、beforeAllocated；actorId 可空以表達顧客／系統事件。舊紀錄不回填、不重寫；新事件保存 before／after、Checkout 及必要 Admin actor。ledger、銀行入帳、CheckoutAudit、CheckoutItem、FulfillmentGroup 以 DB trigger 保持不可覆寫。

## 原子性與重試

- 同顧客 requestId 先取得 CustomerAccount row lock，再以唯一約束及內容 hash 處理重送；不同內容不能重用。
- 先依固定順序鎖 Product，再鎖販售團／offer／SKU，讀取權威價格及庫存；同 SKU 跨團合計；所有預留、明細、快照及流水帳在同一 transaction。
- `available = onHand - reserved - allocated`。預留只增加 reserved；到期只減 reserved；正式建單把 reserved 轉 allocated；均不扣 onHand。
- 回報、到期、入帳、異常及正式建單共用 Checkout row lock。期限在鎖內按伺服器時間檢查。已回報及異常不受一般到期 worker 清理。
- 銀行入帳單獨提交並保留 bankReceivedAt／recordedAt。建單失敗保持 RECEIVED，Admin 可安全重試。
- QB 流水使用台北日期，單次配置全部團別所需編號；額度不足整筆回滾。建單、庫存配置、稽核、outbox 同一交易，Checkout／GroupBuy 唯一約束防止重複。
- 合併出貨的運費由該群組 UUID 排序第一個 GroupBuy 的正式訂單承擔；其他單分攤零，合計精確等於 Checkout 運費，群組仍保留實際運費。

## 配送契約

ShippingRate 以配送方式及溫層設定啟用、費率、免運門檻、尺寸重量與能力依據。無設定即不可用，不內建示例費率。

僅 allowsCombinedShipping 且相同能力／溫層的同次 Checkout 商品可合組；獨立團不與其他團共用免運門檻。未知尺寸、重量、未處理文字限制、超出重量或保守堆疊尺寸皆拒絕。每組保存完整費率與最晚截止時間；不執行實際寄件。

報價 fingerprint 僅用於比較顧客確認的配送條件，絕不當作金額權威；create 重新計算，不接受客戶端價格、運費或總額。變動要求重新報價。

7-ELEVEN 沿用已驗證選店 token、browser binding、有效期限與單次消耗；新增 Checkout FK，DB CHECK 要求消耗目標必為舊 Order 或新 Checkout 擇一；還需開團、SKU 及費率允許。全家使用 Admin 人工核實門市清單（代碼、名稱、地址、核實依據、啟停）；顧客只傳門市 UUID，伺服器鎖定並讀取啟用門市，快照不信任客戶端門市資料。沒有啟用能力或已核實門市即不可選；不宣稱自動串接物流商。

## 私有截圖

以 PostgreSQL bytea 私有保存，不用商品公開圖片儲存。讀取 endpoint 每次檢查 Admin 或 Checkout ownership，回傳 private/no-store、nosniff；沒有公開物件 URL。上傳串流限 5 MB，sharp 驗證並完整解碼單張 JPEG／PNG、像素上限，移除 metadata 並重新編碼，再檢查輸出大小。銀行專用資料位於 BankTransferReport，不要求其他未來支付方式具備末五碼或圖片。

## 到期 worker

```powershell
node --conditions=react-server --import tsx scripts/expire-checkouts.ts
```

可由本機／CI 排程重複呼叫，每次最多 100 筆；只接受既有白名單本機／CI 或隔離測試 DB。Admin 亦可手動執行同一流程。尚未替 Production 建立排程或部署。

## 驗證與限制

基準 main：`a0093d30f8b53984e28c783ae3a35aa641110814`，本機及遠端一致，17 個 migration 均已套用；Docker PostgreSQL 17 healthy。

- unit：1,923 passed；134 skipped 另列，不算通過。Checkout 新增配送／台北日期邊界、權限、CSRF、私有圖片與串流大小測試。
- PostgreSQL integration：137 passed，包括 22 項新 Checkout 測試與 115 項舊訂單、物流、SKU／庫存測試。
- Chromium：18 passed。新 E2E 透過 UI 建商品／SKU、盤點、A/B/C 團、銀行與配送設定、跨團購物車、Checkout、私有截圖、模擬核帳、三張 QB 訂單及我的訂單彙總，也驗收 Admin 全家門市設定與顧客選店，並檢查重複建單與手機寬度。
- 最後的 CI／Security 與合併 SHA 以 PR 及整合回報為準。

基準第一次 Chromium 執行曾失敗且預設 runner 隱藏子程序輸出；啟用診斷重跑及後續完整驗收皆成功，未把首輪失敗算成功。既有 lint 有一則 `_sql` 未使用警告；pg 顯示既有並行 query deprecation 訊息。

外部資源：正式銀行帳戶資料與人工銀行對帳作業、經確認的物流契約／能力、持續更新的已核實全家門市資料、正式 LINE 通道及正式 worker 部署，均須由營運提供／核准。本次 LINE 為隔離資料庫 session fixture，銀行為模擬入帳，沒有假稱完成第三方 LINE 成功登入、真實金流驗證或物流寄件。截圖 DB 儲存需後續容量及備份保留管理。

取消審核、實際退款、Shipment 履約、退回重寄及 LINE Messaging API 不在本期。FulfillmentGroup、退款義務、通知 outbox 已保留擴充點；outbox 尚未送出外部通知。
