# Route Handler 產生的 HTML 控制

`interactions.md` 的 361 個位置是 JSX 來源；以下兩個導頁 HTML 由 Route Handler 字串產生，另列而不遺漏。

|路由／畫面|控制|適用條件及結果|證據|
|---|---|---|---|
|`POST /api/logistics/ecpay/store-map/start`|`ecpay-map` 原生 POST form、MerchantID／MerchantTradeNo／LogisticsType／LogisticsSubType／IsCollection／ServerReplyURL／ExtraData hidden 欄位、繼續選擇門市 submit button|同源、只有一個公開 slug 的 body、有效團與 browser binding；通常由受 CSP hash 保護的 script 自動送出；script 未執行時保留原生 submit。callback 只允許固定舊制／Checkout 目的地|start route 測試檢查完整 HTML、欄位逃逸、CSP、同源、重複欄位及不合法輸入拒絕；M1／M2／7-ELEVEN Checkout E2E 走原生 POST；另以停用 JS 的 context 載入實際回應 HTML，鍵盤 Enter 操作 fallback button 到隔離門市頁|
|`POST /api/logistics/ecpay/store-map/test-fixture`|原生 POST callback form、商家／交易／物流 subtype／state 與合成門市 hidden 欄位、選擇測試 7-ELEVEN 門市 button|僅 fixture flag＋runner 自有隨機 E2E DB；按下按鈕經真正 callback 驗證與 redirect，沒有聯絡物流商|phase-1、M2 與跨團 7-ELEVEN Checkout E2E 實際點擊並核對門市、返回資料與建單|

其餘 11 個 handlers 回傳 JSON、redirect、圖片或健康回應，不直接產生可互動表單畫面；其輸入、角色與拒絕條件見 `routes.md`／`inventory.json` 及專屬 route 測試。
