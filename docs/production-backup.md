# PostgreSQL、私有付款證明與恢復方案

本方案未購買或啟用正式資源。付款截圖現存 PostgreSQL bytea；pg_dump 包含交易、稽核、截圖及關聯，不能只備份訂單表。商品圖片在既有 S3 相容公開儲存，必須另外啟用版本保留／備份，DB 中的 URL 不是圖片備份。

## 目標與成本取捨

|方案|RPO 建議|RTO 目標（尚未測得正式值）|代價與限制|
|---|---|---|---|
|每日 pg_dump＋異地加密|24 小時|4 小時|成本低，但需人工補核遺失區間交易；不建議收款量大時使用|
|managed PITR＋每日可攜 dump|15 分鐘或供應商可保證值|1 小時|建議起點；需確認方案 WAL 保存期限、區域事故與還原費用|
|跨區副本＋PITR＋異地 dump|5 分鐘目標|30 分鐘目標|額外 DB 與流量費；仍須驗證備份，不把 replication 當防誤刪備份|

以上是規劃目標，不是 SLA。正式 RPO/RTO 未驗收前 No-Go。每月還原、每季事故演練、每次 schema 變更前測試備份與回退。

## 保存、加密與權限

建議每日備份保留 35 天、每月快照 12 個月作為待審營運方案，實際期限由負責人／法規審查決定；本次沒有設定自動刪除。付款證明保留多久需依爭議、會計及個資目的分開決定，不自行宣稱法定年限。金鑰與備份分開管理，備份操作者不能更改銀行資訊，下載需審計；物件 bucket 禁止 public ACL，啟用版本與不可變保存政策須另核准。

正式備份流程：指定唯讀 backup login、TLS verify-full 與信任 CA、pg_dump custom format 到受加密磁碟的私有暫存、以管理的加密機制加密、傳到不同故障域、記錄 UTC、DB 版本、應用 SHA、migration checksum、檔案 SHA256 與容量。確認成功後才依核准策略清理暫存；失敗報警。監控最後成功時間 >26 小時、容量異常下降／暴增、異地驗證失敗、物件存取異常。系統日誌不得含 URL 密碼、截圖 bytes 或完整銀行帳號。正式金鑰、bucket、排程、接收人及還原權限尚待提供。

## 容量估算

假設每月 1,000 次 Checkout、每張正規化 PNG 平均 1 MiB，截圖單份約增長 1 GiB/月；上限 5 MiB 時約 4.9 GiB/月，另加索引、TOAST/WAL 與交易資料。PNG 再壓縮效果有限。若每日完整備份保留 35 份、累積 12 GiB 截圖，光備份約 420 GiB 級，須測量實際壓縮比與增量/PITR 費用。不能用目前空付款表的 dump 大小估正式容量。每週觀察 pg_total_relation_size、dump 大小與還原耗時。

## 隔離恢復操作

禁止覆蓋原資料庫。先關閉對外副作用，在獨立網路／憑證／DB 還原；使用 PG17 客戶端與 pg_restore --exit-on-error --no-owner --no-privileges。核對所有表筆數、舊欄位雜湊、bytea SHA256、付款／QB／退款／庫存 ledger 的關聯，套用經審查 migration，確認零 drift，再以 runtime role 查單與下載私有圖片。對帳事故期間實際入退款與寄件，確定無重複執行後才由負責人核准切換。通知保留原 retry key 與 23h 限制，舊事件人工查核，不能整批重送。

`verify-qbuy-migration.ts` 在隨機資料庫實際還原目前 development 備份並驗證歷史；`verify-screenshot-restore.ts` 在兩個自有隔離 DB 間做合成非空 bytea 還原，驗證交易可用性。執行結果見 4A 報告。外部加密異地恢復、供應商 PITR 與災難切換仍 BLOCKED。

## 未來私有 Object Storage 搬遷設計（未執行）

另行核准後使用 additive location/version 欄位，背景逐批 copy、SHA256 校驗、記錄 manifest 與審計、雙讀 fallback；物件 key 不含姓名電話，bucket 私有，短效簽名 URL 必須先驗證 Admin/ownership，禁止快取。完成全量驗證與可回復演練再切讀取；原 bytea 在核准保留期限與兩份可還原備份到位前保留。刪除、資料改寫與正式搬遷不屬 4A 授權。
