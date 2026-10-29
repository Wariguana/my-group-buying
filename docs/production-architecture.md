# QBUY 正式架構與月費比較

2026-10-18 查核官方價格；以下為規劃預算，非報價或購買授權。假設 1,000 Checkout/月、尖峰 10 名同時操作、商品圖片 10 GiB、每張付款截圖平均 1 MiB、單區低流量起步。不以尚未量測的效能假設宣稱容量足夠。

沿用 Next.js Node 24 App Router＋Prisma＋PostgreSQL 17。固定 HTTPS edge → 私有 web；checkout／notification 各自常駐 worker → 同一環境 DB；商品圖片用 S3 相容儲存/CDN，付款截圖留 DB 私有。獨立 migration login、異地加密備份、外部健康監看。Staging 完全分離 DB、憑證與儲存。不採靜態匯出，也不依賴 request 結束後的 serverless 背景工作。

|方案|每月 USD 預算（單一正式環境）|擴充／維護|資料保護與 worker|主要風險|
|---|---|---|---|---|
|4 GiB VPS 自管 PG17 + web + workers|約 $30–45：VM $24、其餘 $6–21 備份/圖片/監控預留|可先加 RAM，再拆 DB；維護較高|常駐容器簡單；自行維護 WAL/異地備份|單機故障域、DB patch/磁碟/還原全自行負責|
|2–4 GiB VPS + managed PG17（建議評估起點）|約 $35–65：VM $12–24、DB compute 約 $15.15 起、storage/圖片/備份餘額|web 與 DB 可獨立升級；維護中等|workers 常駐 VPS；PITR 能力/期限須確認方案|低階 DB 記憶體、總連線、同區失效、額外儲存費|
|Render web + 2 background workers + managed PG|預留 $40–90；正式規格須在選定時取最新報價|部署簡單、各程序獨立擴容；維護較低|原生 background worker；備份/PITR 依 DB plan|三個計算服務各計費，升級 RAM/流量/存放費、區域與 latency|

來源：[DigitalOcean VM 價格](https://www.digitalocean.com/pricing/droplets) 顯示 2 GiB $12、4 GiB $24；[managed DB 價格](https://www.digitalocean.com/pricing/managed-databases) 顯示 1 GiB compute $15.15、storage 另列 $0.215/GiB/月；[Render 價格](https://render.com/pricing) 與 [background worker 支援](https://render.com/docs/background-workers)。Render 動態報價頁未取得完整各規格價格，因此 $40–90 是工程預留，不能當已核實報價。

以上不含網域、稅、銀行／物流／LINE費用、人工值班、超量流量與跨區 HA；外部 Staging 約需再增加相近最低環境的費用，可按驗收窗口縮減但不可讓正式 worker 停機。付款截圖與每日全量備份的長期容量是主要成長項，見備份文件。NTD 依實際付款匯率計，不固定假設匯率。成本監控設定月預算 70%／90% 提醒，誰能增資源與簽約由負責人核准。

暫以一個 web replica，避免在尚無 shared cache/invalidation 驗證下直接水平擴容。需要多 web 時確認 Next cache、server action encryption key 一致、rolling deployment 相容性與 DB 連線預算；worker 程序可多開但同類 job 的 session lock 會序列執行，不能把多開當吞吐量擴充。容量增長先量測 outbox/expiry backlog、DB query p95，再決定批次與 worker 分片方案。

## 2026-10-28 預算收斂：Production＋按需 Staging

月預算維持 NT$1,500–2,500。候選仍是 SGP1 4 GiB web/worker VM＋獨立 Managed PostgreSQL 17＋Cloudflare DNS/TLS/R2。未建立或購買資源；SGP1 實際庫存、PG17、最低 storage 與 PITR 方案須在核准時確認。

本次重新查閱 [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets)、[Managed DB](https://www.digitalocean.com/pricing/managed-databases) 與 [R2 官方定價](https://developers.cloudflare.com/r2/pricing/)。列價：Basic 4 GiB $24/月；1 GiB PG 起始 compute $15.15/月，storage 按 $0.215/GiB/月列示；R2 Standard $0.015/GB-month，含每月 10 GB-month、1M Class A、10M Class B 免費額度。以結帳頁實際報價為準，勿將最小 DB 方案視為 HA。

|規劃項目|USD／月工程預留（非供應商報價）|
|---|---|
|Production 4 GiB VM＋最低 managed PG＋保守另列 10 GiB storage|24＋15.15＋2.15＝41.30|
|備份／圖片／網域／監控／registry／稅費與流量緩衝|8–15|
|按需 Staging 48 小時 VM＋獨立短期 DB＋儲存及重建緩衝|4–7|
|合計規劃區間|53.30–63.30|

若僅用假設匯率 34 作敏感度試算（不是即時匯率），約 NT$1,812–2,152；須另確認營業稅、刷卡匯差及銀行／物流／LINE實際費用，不能保證總帳單一定在預算內。若 DB 升至 2 GiB、Staging 常駐或新增 standby，需重新審核，不能直接宣稱仍符合 NT$2,500 上限。

按需環境需事先核實供應商計費：關機不等於停止磁碟／IP／DB計費。只在獲准的驗收窗口建立獨立 Staging，核對資源清單及備份後才能銷毀；本次僅規劃，未執行此操作。Production 的 worker、備份與監控不因省 Staging 費用而停用。

本機新增 `npm run test:capacity:local`，只在自建隔離 DB 量測報價＋建立 Checkout 的服務吞吐、p50/p95、記憶體與庫存餘額。另以 Linux 容器限制 web 1536 MiB／1.5 CPU、checkout worker 384 MiB／0.25 CPU、測試 PG 768 MiB／0.5 CPU 跑故障演練。兩者均不能取代真實 4 GiB SGP1＋managed DB 網路下的端到端壓測；正式容量驗收仍列外部待驗收。
