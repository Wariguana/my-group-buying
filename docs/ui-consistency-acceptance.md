# QBUY 全站 UI／UX 一致性驗收

最新資訊架構與全站精簡重構結果見 [整合驗收](ui-streamline/README.md)；以下保留先前一致性工作紀錄。

URL 操作連結續作：返回、查看、前往選購、客服及頁首／後台導頁入口統一使用明確外框按鈕；購買卡片以標題搭配「查看本次購買」按鈕呈現。保留 `Link`／`a` 與原網址，沒有改動導頁、交易或資料庫邏輯。最新 2,018 unit passed／163 skipped、完整 Chromium 34 passed，Lint／typecheck 通過。你圈選的退款配送頁與其他新版截圖見 [URL 按鈕畫面](evidence/2026-10-29/url-buttons/README.md)；以下保留前一輪全站規範與證據。

2026-10-29，接續 `7698ab8`（PR #74）。本次針對「每一個頁面、每一個 button」逐頁收斂，共 29 個 page 路由、240 個原始碼互動控制點，其中 55 處 React 原生 button；另含兩個選店 HTML 畫面／2 處按鈕，共 57 處。

## 完成範圍

- 共用 primary／secondary／danger／text／LINE／圖片操作變體；44px 觸控範圍、字級、圓角、hover、active、focus、disabled 與選取提示一致。
- 欄位、勾選／radio 選項、summary、導覽、卡片連結、錯誤與成功回饋、標題與卡片圓角使用同一規格。手機固定送出列保留響應式行為。
- 舊訂購／管理碼／取消表單、後台排序與圖片操作、搜尋及分頁、SKU／庫存／核帳／履約設定全部納入。我的訂單增加卡片間距、配送中文名稱、空搜尋的復原入口，避免與「沒有訂單」訊息重複。
- 加入購物車失敗使用錯誤公告，成功使用狀態公告；新增全站來源檢查與三個反例，避免假別名或局部 utility 繞過按鈕規範。

主要檔案：`src/components/ui/primitives.tsx`、`src/app/globals.css`，以及各頁面／表單消費端。規格見 [UI Guidelines](ui-guidelines.md)。沒有更動 dependency、Prisma schema、migration 或交易 service，所有交易測試資料只寫隔離 DB。

## 已執行驗證

|檢查|結果|
|---|---|
|`npm run lint`|0 error／0 warning|
|`npm run typecheck`|通過|
|`npm run test`|2,017 passed／163 skipped；skipped 不計成功|
|`npm run test:e2e`|34 passed／0 skipped，包含 production build 與 M1–M3|
|全站 AST 規範|240 React 控制點＋2 HTML 按鈕／共 57 button，0 違規|
|三尺寸逐頁|29 路由 × 390／768／1440px，全部通過|

本機執行紀錄：`.temp/ui-lint.log`、`.temp/ui-typecheck.log`、`.temp/ui-unit.log`、`.temp/ui-e2e-integrated.log`。正式發佈、外部銀行／物流／LINE 與雲端驗收界線仍見 [完整品質驗收](qbuy-quality-acceptance.md)。前一輪容量與容器故障演練的版本為 `ccbc461`，本次 UI 續作另跑 production-mode E2E，不把舊映像宣稱為新版映像。

## 逐頁矩陣

每頁檢查可見互動項、展開後的 details、整頁 overflow、欄位字級、按鈕尺寸／字重／圓角、停用、勾選 label、圖片完整載入。動態路由以隔離 fixture 取得實際 ID，必須留在目標路由而非被重新導向；登入頁於登入前檢查。

|路由|390px|768px|1440px|
|---|---|---|---|
|`/`|通過|通過|通過|
|`/admin`|通過|通過|通過|
|`/admin/commerce`|通過|通過|通過|
|`/admin/group-buys`|通過|通過|通過|
|`/admin/group-buys/[id]/edit`|通過|通過|通過|
|`/admin/group-buys/new`|通過|通過|通過|
|`/admin/inventory/[skuId]`|通過|通過|通過|
|`/admin/login`|通過|通過|通過|
|`/admin/operations`|通過|通過|通過|
|`/admin/orders`|通過|通過|通過|
|`/admin/orders/[publicCode]`|通過|通過|通過|
|`/admin/payments`|通過|通過|通過|
|`/admin/pickup-locations`|通過|通過|通過|
|`/admin/pickup-locations/[id]/edit`|通過|通過|通過|
|`/admin/pickup-locations/new`|通過|通過|通過|
|`/admin/products`|通過|通過|通過|
|`/admin/products/[id]/edit`|通過|通過|通過|
|`/admin/products/new`|通過|通過|通過|
|`/admin/qbuy`|通過|通過|通過|
|`/admin/suppliers`|通過|通過|通過|
|`/admin/suppliers/[id]/edit`|通過|通過|通過|
|`/admin/suppliers/new`|通過|通過|通過|
|`/cart`|通過|通過|通過|
|`/checkout`|通過|通過|通過|
|`/checkout/[id]`|通過|通過|通過|
|`/group-buys/[slug]`|通過|通過|通過|
|`/my/orders`|通過|通過|通過|
|`/my/orders/[checkoutId]`|通過|通過|通過|
|`/orders/[publicCode]`|通過|通過|通過|

另涵蓋商品／開團已選的 commerce 頁、付款歷史、完整履約佇列、無搜尋結果、未授權訂單存取表單及 404。根頁 loading／error 控制點納入來源規範；既有 UX 稽核另在隔離 DB 驗證 29 頁真實 loading／error 復原，紀錄見 docs/ux-audit。

## 實際互動與驗收界線

三尺寸均執行跨團購物車、運費報價、慢速雙擊只建單一次、返回／前進、圖片上一張／下一張、配送 radio 切換、鍵盤 Enter 舊制訂購；代表主要按鈕驗證 hover 色與焦點外框。完整 M1–M3 再操作建立資料、停用、庫存、核帳、取消退款、物流、退回及重寄。

來源清冊涵蓋條件式控制點；瀏覽器量測當次顯示的控制項。這些結果不表示把所有角色、庫存、時間、付款與物流狀態的笛卡兒組合逐一點擊，也不包含真實外部交易。

固定 JSON／代表截圖與 SHA256 見 [驗收證據](evidence/2026-10-29/ui-consistency/README.md)。完整頁面截圖與逐頁量測輸出可由 `npm run test:e2e` 重現，來源規範可單獨執行 `npm run test -- tests/ui/consistency.test.ts`。

選店過渡及測試門市 HTML 兩畫面各驗證 390／768／1440px 的 44px 控制、hover／focus 與鍵盤送出。使用 CSP 樣式雜湊，不開放 unsafe-inline。表格另補強編號、電話、狀態與操作詞不折行，固定右側操作欄並驗證不被捲動容器遮擋。

失敗輪次：早期隔離 Admin provisioning 暫時失敗不計成功，保留 .temp/ui-e2e-provision-failed.log；三尺寸檢查曾因前次游標仍懸停而誤判預設色，已在驗證預設態前移開游標，保留 hover 斷言。整合 PR #74 後重新執行完整測試。先前以 PR #73 為基準的測試及圖片已由本次整合結果更新。
