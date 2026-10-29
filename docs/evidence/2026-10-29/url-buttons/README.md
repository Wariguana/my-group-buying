# URL 導頁操作的新版按鈕畫面

以下為本次 production-mode E2E 新產生的截圖，不是使用者照片中的歷史版本。保留 Link／a 語意與原 href，返回／查看／前往／客服等操作文字改用外框按鈕；頁首及後台導頁入口亦有明確表面。

- [對應圈選位置：返回我的訂單（390px）](customer-refund-delivery-390.png)
- [空購物車：前往選購（390px）](page--cart-390.png)
- [我的訂單：查看本次購買（768px）](page--my-orders-768.png)

[來源清冊](source-controls.json)／[結果及 SHA256](verification.json)。驗證 2,018 unit passed、163 skipped（未計成功）、完整 Chromium 34 passed（包含七尺寸巡覽）。來源檢查及瀏覽器量測會攔截 URL 操作退回純底線或無表面的文字標籤。原生按鈕、品牌、整卡、深色導覽與跳至內容各維持其語意及既有互動規格。

未改動資料庫、交易邏輯、依賴或 URL 目的地；僅以隔離資料驗證，不進行真實退款或物流。
