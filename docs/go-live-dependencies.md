# Go-Live Dependency Matrix

2026-10-18 盤點。未提供資源一律 EXTERNAL PENDING／BLOCKED；「負責角色」尚需專案負責人指派實際姓名。4A 工程驗收不等於 4B 授權。下表的停用先上線僅表示技術可行，不代表已批准公開服務。

|項目|目前狀態／所需資源|提供／確認責任|驗收方式|阻止正式啟用|能否停用先公開瀏覽|
|---|---|---|---|---|---|
|銀行收款資訊|PENDING 正式帳戶與戶名|負責人＋財務|雙人核實；核准小額實際入帳|是，Checkout|可，收款與 Checkout 關閉|
|每日對帳|PENDING 銀行明細權限與日結值班|財務|核對實際入帳、Payment/QB/退款差異|是，Checkout|可|
|退款操作|PENDING 銀行退款權限與實作 SOP|財務＋營運|實際小額退款、銀行憑證、雙人覆核|是，Checkout|可|
|7-ELEVEN|PENDING 正式契約、費率、尺寸重量溫層、門市維護|物流負責人|選店與實際交寄／取貨證據分別驗收|該配送必須阻擋|可，方式關閉|
|全家|PENDING 正式契約、費率、能力、門市清單維護頻率|物流負責人|人工核實門市、實際交寄與簽收|該配送必須阻擋|可，方式關閉|
|宅配|PENDING 契約與配送能力／費率／追蹤|物流負責人|不同溫層包裹、實際送達／退回／重寄|該配送必須阻擋|可，方式關閉|
|LINE Login|PENDING 正式 channel、固定 callback、Provider|LINE 帳號管理人|真實同意登入、拒絕、登出、session 安全|是，顧客交易|可，登入與交易關閉|
|LINE Messaging|PENDING token、Provider 一致、好友／同意／推播資格|LINE 管理人＋客服|核准接收人測試接受／失敗／封鎖／撤回|若無替代客服通知則阻擋|可，LINE_PUSH 關閉並核准替代 SOP|
|官方客服入口|PENDING 已核實官方 URL 與值班|營運|顧客可聯繫且有人處理|是，Checkout|可，純展示|
|庫存盤點|PENDING 實體 SKU 盤點與初始 ledger|倉管|onHand/reserved/allocated 與實體相符|是，Checkout|可|
|舊 Order|PENDING 未完單名冊與責任分工|營運＋財務|逐筆核對；不套 QB 規則|是，涉及舊單公開服務|有明確處理方案才可|
|取消退款條款|PENDING 正式政策與顧客告知|負責人＋法規顧問|審核條款、客服回應、顧客確認|是，Checkout|可，展示內容仍需審核|
|食品品質／退回|PENDING 品檢、責任、期限、銷毀與重售規則|食品／營運負責人|情境演練與政策核准|是，相關商品|可，商品停用|
|個資與付款證明|PENDING 告知、保存期限、權利申請與事件 SOP|個資負責人／顧問|書面審查、存取審計、備份期限一致|是，收集個資|純展示仍需隱私審查|
|網域 DNS TLS|PENDING 網域及管理權限|平台管理人|固定 HTTPS、憑證續期、Host 驗證|是，公開服務|否|
|主機／registry|PENDING 核准供應商、費用與區域|負責人＋平台|非 root 映像、監控、重啟／回退|是|否|
|PostgreSQL 17|PENDING 獨立正式 DB 與 roles／TLS|DB 管理人|migration、最小權限、容量／故障驗收|是|否|
|備份與 PITR|PENDING 異地加密儲存、金鑰、保存與恢復|DB 管理人|真實外部還原、RPO/RTO 證據|是，交易|可，無交易資料時另核准|
|worker 排程|工程實作；正式排程 PENDING|平台值班|停機恢復、重複啟動、heartbeat 及 backlog|是，Checkout|可，Checkout 關閉|
|監控／告警|工程實作；接收人與外部 watcher PENDING|平台＋營運值班|注入 HTTP/DB/worker/備份故障並實收告警|是，交易|需核准展示服務最低監控|
|商品圖片|PENDING 正式 bucket／CDN、權限與版本備份|平台＋商品營運|上傳、跨環境隔離、備份恢復|是，完整商城|僅無圖片展示且核准|
|Staging|本機隔離測試；外部環境 PENDING|平台＋QA|實際 HTTPS/OAuth/手機／故障測試|是，正式交易|另核准展示環境|
|成本與預算|PENDING 方案選定與上限|專案負責人|帳單估算、流量與儲存告警|是，付費部署|否|
|4B 上線授權|未取得|專案負責人|Matrix 全部必要項簽署、變更窗口與回退人|是，任何 Production 部署|否|

## 2026-10-29 本機工程補充

UI／交易／權限與資源限制容器驗收、合成付款截圖還原、安全依賴修補及完整 audit 已由本次品質工作執行，見 [品質驗收](qbuy-quality-acceptance.md)。此補充不將表中任何正式外部資源改為已驗收；真實銀行、物流、LINE、外部 Staging／雲端／備份／告警與 Production 授權仍 PENDING／NO-GO。
