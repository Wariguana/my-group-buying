# QBUY 隔離效能驗證（2026-11-07）

## 結論

本機測試條件內，沒有觀察到網頁、資料庫或結帳預估延遲異常。先完成 2,880 次併發 1／5／10 的短突發測量，再完成 23,366 次併發 10 的持續測量，合計 **26,246 次，錯誤與 timeout 均為 0**。

這不是正式環境容量認證，也不是長時間耐久測試。HTTP 數字為完整 HTML 回應時間，不包括圖片、JavaScript、網路遠端延遲或瀏覽器 LCP。

## 資料與環境

- 每輪獨立建立：20 類別、2,000 products/SKUs、500 團購（400 進行中、100 結束、50 精選）、10,000 offers、500 圖片中繼資料。
- 純預估另使用假顧客與合成收款／運費設定，沒有真實訂單或個人資料。
- Windows 11、Intel Core i7-14700F（28 logical CPUs）、約 31.79 GiB RAM。
- Node v24.15.0、Next.js 16.4.1 production build、PostgreSQL 17.11。
- HTTP client、應用及資料庫都在本機 loopback；資料／查詢緩衝已暖機，連線池上限 10。測量沒有與其他驗證程序同時執行。
- HTTP 包含首頁、商品搜尋、精選、分類、第 10 頁、團購詳情，檢查 200 狀態及每輪合成識別文字。
- 最大併發 10；HTTP timeout 10 秒，SQL statement timeout 20 秒；錯誤率超過 5% 提前停止，不重試測量請求。

## 持續測試（主要結果）

|測量|併發|持續時間|成功請求|RPS|p50|p95|p99|最慢|錯誤率|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|六種 HTTP 路由混合|10|30.021 秒|6,557|218.42|44.64 ms|59.26 ms|67.81 ms|79.42 ms|0%|
|同顧客／同商品的純結帳預估|10|30.008 秒|16,809|560.16|16.75 ms|24.92 ms|34.32 ms|44.50 ms|0%|

HTTP 各路由 p95 為 55.97–64.21 ms，沒有只挑最快路由。純預估包含實際應用驗證及 Prisma 交易查詢，不是單一 SQL 的執行時間。

此輪含建資料、啟停與清理共 69.245 秒。延遲使用 nearest-rank percentiles；RPS 僅是這輪負載的觀察值，不能推估正式環境上限。

## 短突發與資料庫

短突發每個 workload 先暖機 3 次（不計入），再於併發 1／5／10 分別測量 20／60／100 次。HTTP 1,080 次、應用 service 1,260 次、純預估 180 次、SQL 360 次。

併發 10 的摘要：

|測量|p50|p95|p99|錯誤率|
|---|---:|---:|---:|---:|
|HTTP 完整 HTML|47.77 ms|70.05 ms|77.66 ms|0%|
|商城／購物車 service|11.24 ms|16.48 ms|18.54 ms|0%|
|純結帳預估|14.99 ms|19.38 ms|21.36 ms|0%|
|PostgreSQL round-trip|0.68 ms|1.36 ms|9.50 ms|0%|

SQL round-trip 混合 `SELECT 1` 與依團購查詢 offer／inventory，包含連線池及 client 往返，樣本短，尾端數字容易受排程影響；不可誤稱所有資料庫查詢都只需 1 ms。

實際 storefront 代表性 SQL 的 EXPLAIN ANALYZE BUFFERS：

|查詢|初次 execution|持續測試資料庫重測 execution|
|---|---:|---:|
|團購 count|0.071 ms|0.079 ms|
|商品搜尋 count|1.302 ms|1.319 ms|
|24 張卡片價格／庫存聚合|5.247 ms|5.859 ms|

計畫使用既有 GroupBuy、GroupBuySku、Product、SkuInventory、GroupBuyImage 索引。500 筆團購的 count 使用 sequential scan 屬合理選擇。卡片查詢對 2,000 筆 ProductSku 重複掃描 24 次（48,000 visited rows），是資料量擴大後應再量測的觀察點；現有主鍵已存在，本輪時間不足以證明需新增索引，因此沒有盲加索引或快取。

## 安全、清理與限制

- 每輪只使用新產生的本機隔離 DB，來源開發 URL 僅提供連線資訊，未讀寫開發／正式業務資料。
- HTTP 結帳寫入、登入、外部物流與推播關閉。只有測試父程序在純預估階段開必要旗標，使用 `quoteOnly=true`。
- 每輪前後都確認 Checkout 筆數為 0、reserved 總量為 0。
- 自有 server 已退出、連線已關閉、port 已釋放；每輪 DB 刪除後再查 `pg_database` 證實不存在。
- 首次暖機因合成 slug 格式不合而停止，未進入正式測量；修正 fixture 並清理後重跑，失敗嘗試未混入數據。
- 無 schema、依賴、環境檔、索引或應用設定變更。現有 pg 8 棄用警告列為未來升級觀察，不影響本次通過結果。
- 無正式資料、外部供應商測試、真實下單、最大容量、長時間 soak、冷啟動或實機瀏覽器效能認證。

可重查摘要與完整 EXPLAIN：`performance-summary.json`。每次請求原始資料、測試腳本與執行 log 保留於專案 `.temp/perf-review-20261107/`，包括 `results.json`、`sustained-results.json`、`REPORT.md`、`sustained-REPORT.md`。
