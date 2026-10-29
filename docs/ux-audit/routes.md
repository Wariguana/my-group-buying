# 全站來源路由盤點

由 scripts/ux-inventory.ts 自動掃描。頁面 29；Route Handlers 13。靜態盤點不等於操作通過。動態路由須使用隔離 fixture；驗收結果見 README.md 與 evidence。

來源摘要 SHA256：919e4beafdac7aa7c3a3d908938c6f9596aaebc5f767162e6be30c0b55806aae

|路由|用途|類型／角色|進入條件|導覽入口|來源|互動來源數|驗收狀態|
|---|---|---|---|---|---|---|---|
|/|商城、搜尋、分類、精選與截止商品|page／public-or-owner|公開路由；商品須符合展示資格|品牌 Logo、返回商城／團購列表連結、直接首頁|src/app/page.tsx|19|source-inventoried-see-page-state-results|
|/admin|營運統計、最近訂單與工作入口|page／admin|伺服器 requireAdmin；動態 ID 必須存在|登入成功、管理導航營運首頁|src/app/admin/(protected)/page.tsx|15|source-inventoried-see-page-state-results|
|/admin/commerce|SKU、規格、共用庫存、分類與開團販售|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航 SKU／分類／庫存、庫存紀錄返回商品|src/app/admin/(protected)/commerce/page.tsx|66|source-inventoried-see-page-state-results|
|/admin/group-buys|團購列表、狀態與管理入口|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航團購管理|src/app/admin/(protected)/group-buys/page.tsx|8|source-inventoried-see-page-state-results|
|/admin/group-buys/[id]/edit|編輯團購，保留既有資料與歷史約束|page／admin|伺服器 requireAdmin；動態 ID 必須存在|團購列表編輯；商品／團購也可從 SKU 工作台進入|src/app/admin/(protected)/group-buys/[id]/edit/page.tsx|37|source-inventoried-see-page-state-results|
|/admin/group-buys/new|新增團購|page／admin|伺服器 requireAdmin；動態 ID 必須存在|團購列表新增／空狀態入口|src/app/admin/(protected)/group-buys/new/page.tsx|35|source-inventoried-see-page-state-results|
|/admin/inventory/[skuId]|完整庫存流水帳與游標分頁|page／admin|伺服器 requireAdmin；動態 ID 必須存在|商品 SKU 查看完整庫存流水帳|src/app/admin/(protected)/inventory/[skuId]/page.tsx|8|source-inventoried-see-page-state-results|
|/admin/login|管理員登入與登出失敗提示|page／anonymous-admin|未登入的管理員；已有有效 session 時轉工作台|未登入保護路由導向、直接登入頁|src/app/admin/login/page.tsx|4|source-inventoried-see-page-state-results|
|/admin/operations|Worker 心跳、佇列、告警與安全開關狀態|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航平台監控|src/app/admin/(protected)/operations/page.tsx|11|source-inventoried-see-page-state-results|
|/admin/orders|歷史訂單搜尋、佇列、篩選與分頁|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航訂單管理、營運首頁訂單入口|src/app/admin/(protected)/orders/page.tsx|25|source-inventoried-see-page-state-results|
|/admin/orders/[publicCode]|歷史訂單核款、取消、取貨與物流|page／admin|伺服器 requireAdmin；動態 ID 必須存在|訂單列表、營運首頁最近訂單|src/app/admin/(protected)/orders/[publicCode]/page.tsx|23|source-inventoried-see-page-state-results|
|/admin/payments|銀行／配送／門市設定、核帳、建單及例外稽核|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航轉帳核帳、平台監控、QB 工作台核帳入口|src/app/admin/(protected)/payments/page.tsx|26|source-inventoried-see-page-state-results|
|/admin/pickup-locations|取貨地點列表、狀態與管理入口|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航取貨地點管理|src/app/admin/(protected)/pickup-locations/page.tsx|9|source-inventoried-see-page-state-results|
|/admin/pickup-locations/[id]/edit|編輯取貨地點，保留既有資料與歷史約束|page／admin|伺服器 requireAdmin；動態 ID 必須存在|取貨地點列表編輯；商品／團購也可從 SKU 工作台進入|src/app/admin/(protected)/pickup-locations/[id]/edit/page.tsx|14|source-inventoried-see-page-state-results|
|/admin/pickup-locations/new|新增取貨地點|page／admin|伺服器 requireAdmin；動態 ID 必須存在|取貨地點列表新增／空狀態入口|src/app/admin/(protected)/pickup-locations/new/page.tsx|14|source-inventoried-see-page-state-results|
|/admin/products|商品列表、狀態與管理入口|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航商品管理|src/app/admin/(protected)/products/page.tsx|9|source-inventoried-see-page-state-results|
|/admin/products/[id]/edit|編輯商品，保留既有資料與歷史約束|page／admin|伺服器 requireAdmin；動態 ID 必須存在|商品列表編輯；商品／團購也可從 SKU 工作台進入|src/app/admin/(protected)/products/[id]/edit/page.tsx|22|source-inventoried-see-page-state-results|
|/admin/products/new|新增商品|page／admin|伺服器 requireAdmin；動態 ID 必須存在|商品列表新增／空狀態入口|src/app/admin/(protected)/products/new/page.tsx|22|source-inventoried-see-page-state-results|
|/admin/qbuy|QB 取消退款、退回品檢、重寄與通知工作台|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航 QB 取消退款與履約、平台監控|src/app/admin/(protected)/qbuy/page.tsx|36|source-inventoried-see-page-state-results|
|/admin/suppliers|供應商列表、狀態與管理入口|page／admin|伺服器 requireAdmin；動態 ID 必須存在|管理導航供應商管理|src/app/admin/(protected)/suppliers/page.tsx|9|source-inventoried-see-page-state-results|
|/admin/suppliers/[id]/edit|編輯供應商，保留既有資料與歷史約束|page／admin|伺服器 requireAdmin；動態 ID 必須存在|供應商列表編輯；商品／團購也可從 SKU 工作台進入|src/app/admin/(protected)/suppliers/[id]/edit/page.tsx|18|source-inventoried-see-page-state-results|
|/admin/suppliers/new|新增供應商|page／admin|伺服器 requireAdmin；動態 ID 必須存在|供應商列表新增／空狀態入口|src/app/admin/(protected)/suppliers/new/page.tsx|18|source-inventoried-see-page-state-results|
|/api/admin/group-buy-images|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|POST：Admin session、同源、圖片型別／大小與 pending upload 驗證|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/admin/group-buy-images/route.ts|0|source-inventoried-see-page-state-results|
|/api/auth/line/callback|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|GET：OAuth state、token 與身分驗證；拒絕流程可離線驗收|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/auth/line/callback/route.ts|0|source-inventoried-see-page-state-results|
|/api/auth/line/logout|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|POST：同源、清除顧客 session|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/auth/line/logout/route.ts|0|source-inventoried-see-page-state-results|
|/api/auth/line/start|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|GET：OAuth state 與安全回訪路徑；真實 LINE 外部驗收另列|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/auth/line/start/route.ts|0|source-inventoried-see-page-state-results|
|/api/checkout|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|POST：同源、限流、Zod；quote/create 顧客 ownership，其餘 Admin|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/checkout/route.ts|0|source-inventoried-see-page-state-results|
|/api/checkout/[id]/screenshot|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|GET：Admin 或顧客 ownership；POST：同源、顧客 ownership、限流、圖片上限／解碼|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/checkout/[id]/screenshot/route.ts|0|source-inventoried-see-page-state-results|
|/api/group-buy-images/e2e/[...key]|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|GET：僅隨機隔離 E2E DB＋fixture flag，正式環境關閉|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/group-buy-images/e2e/[...key]/route.ts|0|source-inventoried-see-page-state-results|
|/api/health/live|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|GET：最小公開存活資訊|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/health/live/route.ts|0|source-inventoried-see-page-state-results|
|/api/health/ready|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|GET：最小公開就緒狀態，失敗不洩漏底層錯誤|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/health/ready/route.ts|0|source-inventoried-see-page-state-results|
|/api/logistics/ecpay/store-map/callback|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|POST：權威 state/trade、TTL、商家與物流 subtype、權威門市驗證；不信任跨站 cookie|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/logistics/ecpay/store-map/callback/route.ts|0|source-inventoried-see-page-state-results|
|/api/logistics/ecpay/store-map/start|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|POST：同源、僅一個公開 slug、瀏覽器 HttpOnly binding、有效開團；flow 只允許固定 Checkout 返回|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/logistics/ecpay/store-map/start/route.ts|0|source-inventoried-see-page-state-results|
|/api/logistics/ecpay/store-map/test-fixture|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|POST：僅隨機隔離 E2E DB＋fixture flag，無外部物流副作用|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/logistics/ecpay/store-map/test-fixture/route.ts|0|source-inventoried-see-page-state-results|
|/api/qbuy|HTTP 邊界（方法、輸入與權限見來源及專屬測試）|handler／依 HTTP 方法／命令，見進入條件|POST：同源、限流、嚴格命令 schema；cancel/withdraw ownership，其餘 Admin|由前端表單／API caller 或供應商 callback 進入；詳見來源|src/app/api/qbuy/route.ts|0|source-inventoried-see-page-state-results|
|/cart|跨團購物車、數量、改價與庫存重驗|page／public-or-owner|可匿名；瀏覽器本機購物車，價格與資格由伺服器重驗|顧客頁首／商城購物車、商品詳情查看購物車|src/app/cart/page.tsx|15|source-inventoried-see-page-state-results|
|/checkout|收件資料、選店、配送報價與建立購買|page／customer|顧客 session；動態購買 ID 必須屬於本人|購物車前往跨團結帳、7-ELEVEN 選店 callback|src/app/checkout/page.tsx|19|source-inventoried-see-page-state-results|
|/checkout/[id]|銀行付款資訊、期限與私有截圖回報|page／customer|顧客 session；動態購買 ID 必須屬於本人|建立購買成功、我的訂單本次購買卡片|src/app/checkout/[id]/page.tsx|15|source-inventoried-see-page-state-results|
|/group-buys/[slug]|商品圖集、SKU 選擇／舊制訂購|page／public-or-owner|公開路由；商品須符合展示資格|商城商品卡查看團購、公開團購連結|src/app/group-buys/[slug]/page.tsx|34|source-inventoried-see-page-state-results|
|/my/orders|顧客歷史購買彙總|page／customer|顧客 session；動態購買 ID 必須屬於本人|顧客頁首與商城我的訂單、錯誤恢復入口|src/app/my/orders/page.tsx|19|source-inventoried-see-page-state-results|
|/my/orders/[checkoutId]|QB 取消、退款與出貨歷程|page／customer|顧客 session；動態購買 ID 必須屬於本人|我的訂單與付款頁的取消／退款／配送進度|src/app/my/orders/[checkoutId]/page.tsx|26|source-inventoried-see-page-state-results|
|/orders/[publicCode]|歷史訂單授權、取貨付款與取消|page／public-or-owner|公開存取驗證入口；詳情須 ownership 或有效訂單存取權杖|舊制訂購成功查看訂單、我的訂單歷史卡片、訂單存取連結|src/app/orders/[publicCode]/page.tsx|15|source-inventoried-see-page-state-results|
