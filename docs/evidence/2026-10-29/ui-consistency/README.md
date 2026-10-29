# 全站 UI 一致性證據

全為隔離合成資料；商品圖使用 repository 既有 SVG 圖示作為測試占位。

[元件清冊](source-controls.json)涵蓋 240 個原始碼控制點，55 處 React button，加上 2 處獨立選店按鈕，共 57 處 button；不是動態資料列數量。[結果與 SHA256](verification.json)。

|寬度|page 路由|含額外狀態的檢查頁次|量測元件實例數|
|---|---:|---:|---:|
|[390px](browser-390.json)|29|36|750|
|[768px](browser-768.json)|29|36|797|
|[1440px](browser-1440.json)|29|36|846|

量測包含重複導覽與資料列實例，不等於唯一操作數。檢查 sizes／type／radius／disabled／checkbox label／images／overflow；實際動作驗證由 E2E 案例另行執行。

## 代表截圖

- [page--admin-commerce-768.png](page--admin-commerce-768.png)
- [page--admin-group-buys-id-edit-390.png](page--admin-group-buys-id-edit-390.png)
- [page--admin-login-390.png](page--admin-login-390.png)
- [page--admin-orders-1440.png](page--admin-orders-1440.png)
- [page--admin-payments-390.png](page--admin-payments-390.png)
- [page--checkout-id--1440.png](page--checkout-id--1440.png)
- [page--group-buys-slug--390.png](page--group-buys-slug--390.png)
- [page--my-orders-768.png](page--my-orders-768.png)
- [page-home-1440.png](page-home-1440.png)
- [store-map-bridge-1440.png](store-map-bridge-1440.png)
- [store-map-bridge-390.png](store-map-bridge-390.png)
- [store-map-bridge-768.png](store-map-bridge-768.png)
- [store-map-fixture-1440.png](store-map-fixture-1440.png)
- [store-map-fixture-390.png](store-map-fixture-390.png)
- [store-map-fixture-768.png](store-map-fixture-768.png)

完整 29×3 頁面截圖每次執行 `npm run test:e2e` 於 `test-results/qbuy-experience-*` 重新產生。使用 UUID 及時間會不同。[逐頁矩陣與驗收界線](../../../ui-consistency-acceptance.md)。
