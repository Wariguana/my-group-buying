# QBUY 里程碑 3：取消、退款、合併履約、退回重寄與 LINE 通知

## 操作入口

- 顧客 `/my/orders`：依 QB 編號搜尋、每頁 20 筆本次購買，點「取消申請、退款與配送進度」進入 `/my/orders/{checkoutId}`。伺服器逐次驗證 ownership。
- Admin `/admin/qbuy`：待審取消／阻擋出貨、待退款、退款異常、待建立物流、出貨異常、退回待處理、逾期 7 天、重寄待收運費、通知失敗佇列。可搜尋 QB 編號／姓名／電話，每頁 20 筆。
- `/admin/payments` 保留人工入帳、銀行核帳、私有截圖及正式建單流程。舊 `/admin/orders` 保持舊 Order 操作；不將新版 QB 單交給舊服務。
- 客服連結由 `QBUY_LINE_OFFICIAL_URL` 設定，僅接受 LINE 官方網域。尚未設定時明示待營運設定，不杜撰官方帳號。

## 顧客與 Admin 完整流程

1. 跨團 Checkout → 顧客付款回報 → Admin 查核銀行入帳 → 正式成立各團 QB 訂單。
2. 顧客在截止前、所有受影響群組尚無物流歷史時提出取消；「其他」原因須備註。顯示取消審核中，並可在待審時撤回。
3. Admin 查看原始申請時間、原因、訂單、涉及的全部物流群組及退款試算。核准／拒絕均需理由；拒絕說明顧客可見。資格以成功提出時為準，不因晚審失效。
4. 核准後釋放 allocated，保留 onHand，依原費率快照重算受影響群組；建立獨立退款義務。退款為零／負數進客服確認佇列，保持訂單及庫存，暫停相關群組。Admin 可拒絕結案；不自動補收或沖帳。
5. Admin 記錄「退款處理中」，完成實際銀行退款後，輸入銀行交易參考、依據及二次確認才能標記「已退款」。測試使用模擬依據，本次沒有實際匯退款。
6. 截止、付款、取消、收件資料及物流能力通過交易內重查後，人工輸入已核實追蹤號建立物流。逐次記錄交寄、運送、到店／配送、實際取貨／送達及完成證據。
7. 一張 QB 訂單涉及多個物流群組時，所有群組確認交付後才完成該訂單。

## 退回重寄

物流退回不等於 QBUY 已收到。Admin 先記錄「已退回」，實際收回包裹時再確認收到，從此刻起算 7 天客服期限。期限屆滿只入逾期佇列，不沒收、不自動退款、不回補可售庫存。

實收數量必須與包裹明細相符，完成品質查核後才可安排重寄；品質不合格保留客服處理。需記錄責任歸屬、配送能力、核實的新門市／地址及新費用。重寄以當時已確認運費計價，不套用原免運門檻。QBUY／物流責任得記錄免收依據；顧客責任不能直接免除新費用。

正數重寄費需核實入帳及唯一銀行交易參考；零費用需先核實責任及免收。之後建立新 Shipment，保留原追蹤號、地址、事件與前次物流關聯。重寄包裹不再扣一次原本已出庫的商品。未交寄的重寄單在外部作廢核實後可重新安排，所有嘗試保留。

可售庫存回補沿用有操作者及原因的庫存 ledger；退回／重寄服務完全不自動回補。營運需在實收、品檢及可再販售判定完成後才執行盤點異動。

## 模型、鎖定與不可變資料

新增 migration `20261018180000_qbuy_lifecycle`。原 20 個 migration 不改寫。新增 CancellationRequest、FulfillmentAdjustment、QbShipment、QbShipmentEvent、QbReturnCase、GroupBuyDeadlineHistory、LineRecipient、NotificationDelivery；加欄擴充 RefundObligation、CheckoutOutbox。

- QbOrder 與物流群組的多對多關係由不可變 CheckoutItem 的 `checkoutId + groupBuyId + fulfillmentGroupId` 推導，不設單一 group 欄位。Shipment 保存實際 SKU／數量／團別明細快照。
- 所有取消、審核、物流、退款與重寄交易依序鎖 Checkout，再依 UUID 排序鎖其 FulfillmentGroup。庫存使用原 Product row lock 權威。跨團同 SKU 先合計再異動。
- DB partial unique index 限制每張訂單最多一個未結案取消、每組最多一張有效物流。已完成物流仍占有效位置；退回及作廢保留歷史。
- 顧客送出取消時重新鎖開團並查截止時間。出貨以原 waitUntil、目前截止及已有 Checkout 後的截止異動最大值為保守界線，避免延後再縮短造成提前出貨。
- 商品快照、運費調整、物流事件、退款已結案紀錄、取消已結案紀錄、物流快照及通知身份／內容均有資料庫保護。只准服務定義的狀態操作。
- 付款及建單不扣 onHand；核准取消只減 allocated；首次交寄同時減 onHand 與 allocated。物流事件 requestId 唯一，重試不重複扣庫。
- 取消與退款分離。退款義務依事件鍵追加；已退款後新入帳建立新義務，保留先前金額與結案狀態。舊資料取得 `legacy:{id}` 事件鍵，不重寫原欄位。
- 退款參考與依據拒絕連續長數字，避免把完整帳號當成參考／一般備註。顧客端沒有完整銀行帳號收集表單。

## 通知執行與權限

`npm run notifications:run` 執行有界限的非同步 worker。多 worker 以 SKIP LOCKED 與 lease 分工；業務交易只寫 outbox，外部 LINE 呼叫在交易提交之後。網路失敗不回滾取消／退款／付款。

事件涵蓋轉帳回報、付款異常、取消申請、金額需客服確認、取消核准／拒絕、退款異常／實際完成及核實物流狀態。通知只包含簡要文字及需登入入口；轉帳截圖仍在私有端點檢查 Admin／ownership，不公開圖片 URL。

每位收件人有獨立 delivery 與固定 retry key。每事件最多 8 次嘗試，以退避排程，23 小時後停止自動重試並待人工查核。HTTP 2xx 或含 accepted-request-id 的 409 視為 LINE 已接受，並不宣稱使用者已閱讀。重試遵循 [LINE 官方重試規則](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)。

正式發送需 `LINE_MESSAGING_ENABLED=true`、`LINE_MESSAGING_ACCESS_TOKEN`、`LINE_MESSAGING_PROVIDER_ID`；顧客還需 `LINE_LOGIN_PROVIDER_ID` 與 Messaging provider 相同，已核實一致 LINE user ID、推播資格與接收同意。Admin 於工作台記錄核實依據和操作者，亦能停用／撤回同意並留痕。沒有經核實對象時事件進 BLOCKED，不能僅因 LINE Login 就推播。

尚未實際發送 LINE，未完成官方帳號外部驗收。正式 webhook 自動同步追蹤／封鎖狀態尚需下一階段營運整合；本版採人工驗證與停用。Worker 尚未部署正式排程。

## 開發資料庫銜接與可重現驗證

開始時 main 為 `6780e8cb921c67a7e8698be4f539dce8a5ea696d`，Docker PostgreSQL 17 healthy，開發 DB 17 migrations。先備份並列出 archive，再還原到隨機隔離 DB。

首次 drift 發現 SQL 已有而 Prisma 未描述的 BankReceipt.actorId、CheckoutItem.offerId 外鍵；當時停止套用 development DB，補齊 Prisma 關聯描述後重新驗證。隔離通過後 development 安全由 17 更新為 20，原表所有原始欄位內容雜湊與筆數一致，18 張舊 Order、18 筆 OrderItem、19 筆選店紀錄保留。

備份存於本機 `backups/`（Git 忽略）；首份為 `my-group-buying-20261018T075919-645Z.dump`，20 migrations 版本為 `my-group-buying-20261018T081016-974Z.dump`。驗證腳本：

```powershell
node --import tsx scripts/verify-qbuy-migration.ts backups/<backup>.dump
# 僅前項成功且 source 指向允許的本機開發 DB 時：
node --import tsx scripts/verify-qbuy-migration.ts backups/<backup>.dump --apply-development
```

腳本先限制來源為允許的 loopback development／CI DB，建立自有隔離 DB，還原備份、比對全部原欄位雜湊、migrate deploy／status／零 drift，再比對歷史。只有明確 flag 才套用 development；只清理自己建立的隔離 DB。不重建 development、不刪除 volume、不更動舊 migration。

另有非空歷史 migration 測試：依序建立原 20 個 migrations，放入已退款義務與已送出 outbox，套用 M3 後驗證原欄位與金額不變，並可追加同原因的新退款義務。

## 驗收紀錄

本機驗收：Prisma validate、typecheck、lint（0 error，既有 `_sql` 未使用 warning 1 則）通過；unit 1,941 passed，156 skipped 另列；真 PostgreSQL integration 159 passed、0 skipped；Chromium 19 passed、0 skipped。E2E runner 已執行 production build；另執行獨立 build。CI／Security 結果與 merge SHA 以本次 PR／交付回報為準。

development 已套用至 21 個 migrations，最終 migrate status 正常、schema drift 為零，全部原表原欄位雜湊不變。沒有遺失舊 Order／OrderItem／Shipment 或既有付款、退款、物流資料。

PostgreSQL 案例覆蓋跨團共用物流、同單跨溫層多群組、兩名管理員建單、取消／出貨競態、延遲審核、撤回與拒絕、運費 400+350／699／60 算例、依次退款 340+410、獨立群組不受影響、已結案退款後追加入帳、出庫一次、實際交付、退回期限／品質／費用／重寄、通知失敗與固定 retry key、ownership 和舊資料相容。

Chromium 新流程以模擬 LINE session 及模擬銀行依據操作實際 UI：兩筆跨團購買核帳 → 取消其中一單 → 核准 → 340 元退款處理及二次確認 → 合併物流交寄／送達；獨立第二筆走退回 → 實收 → 品檢 → 60 元重寄費 → 新地址／新物流 → 再交寄。庫存斷言為 A onHand=9、B onHand=8，重寄不再扣庫。沒有真實銀行或物流呼叫。

曾遇到並已定位的驗收問題包括：新增 E2E 型別缺漏、嵌套 locator 範圍錯誤，以及測試排序導致共享 CheckoutSettings fixture 建置衝突。失敗輪次不算 passed。integration runner 將新 fixture suite 明確排在既有 suite 後；skipped 單獨列出，不計入 passed。

## 里程碑 4／正式上線驗收清單

- 營運核實銀行帳戶、實際入帳與退款 SOP、操作者權限、二次確認與日結對帳；核准實際小額金流驗收。
- 取得 7-ELEVEN／全家／宅配契約與能力、門市資料維護來源、追蹤／取貨／送達證據；驗收人工流程或正式 provider API、簽章、防重送及外部作廢確認。
- 核准正式 LINE provider／channels、官方帳號客服 URL、同意及可推播關係；驗收封鎖、撤回同意、失敗查核及工作排程告警。
- 經適當法規及營運審核確認取消／退款／食品品質／退回責任／保留期限等正式政策。本實作不自行擴張政策。
- 正式備份、還原演練、migration staging、最小資料庫權限、稽核及私有截圖保留／容量管理。
- CI／Security required checks 和必要審核全部完成後，另行取得 Production 部署授權，執行部署與 smoke test／回復計畫。

本階段不部署 Production，不執行真實匯退款、寄送、作廢或重寄，也不把隔離測試結果當成外部整合成功。
