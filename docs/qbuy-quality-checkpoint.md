# QBUY 品質收斂 checkpoint

基準：`0c76ed5a8f552c8de01bbc25ca8cd4ade79496f4`；2026-10-28 已以 `git ls-remote` 確認遠端 main 相同。
原始 repo：`D:/my-group-buying`，工作分支：`codex/qbuy-quality-20261028`；工作樹位於桌面啟動器目錄下 `qbuy-quality/`。

## 已確認的資料安全邊界

- 原始工作樹乾淨；development 為 loopback PostgreSQL 17、22 migrations、18 張歷史 Order、0 張 QbOrder。
- 未對原始 DB 執行 migration、重設、刪除或回填。所有新測試資料位於 runner 自建隨機隔離 DB。
- 交易核心／Prisma schema／22 個既有 migrations 不變；Checkout service 僅增加安全的報價顯示 projection。
- 未購買、部署正式服務或呼叫真實銀行／LINE／物流。

## 已完成的修改

- 品牌與共用元件、手機頁首、鍵盤焦點、觸控尺寸、載入／錯誤／空狀態。
- Checkout 按實際配送方式顯示欄位，逐群組商品／免運條件／運費／等待截止預覽。
- 購物車重驗失敗處理、跨分頁清空事件、安全結帳入口。
- 付款／退款狀態與下一步說明；付款截圖手機輸入及客服入口。
- Admin 表單防止同時重送；收到成功確認才更新操作識別碼，失敗保留原碼供安全重試。
- 銀行 datetime-local 固定解析為 Asia/Taipei；日期錯誤與非 JSON 回應可讀提示。
- 核帳搜尋、分頁、空狀態；統一臺灣時間及退款狀態。
- SKU 頁面不再同時顯示有規格可買及「沒有商品」。

## 已執行的證據

- `.temp/baseline-unit-host.log`：1,959 passed、162 skipped；隔離整合另跑。
- `.temp/integration.log`：原 165 項 PostgreSQL 整合通過。
- `.temp/unit-review.log`：1,965 passed、163 skipped（含新增 6 項表單／時區驗證；新增整合案例當時尚未啟用）。
- `.temp/e2e-second.log`：原 20 條 Chromium 通過，含 production build。
- `.temp/screenshot-restore.log`：非空合成截圖 dump/restore、SHA256、付款關聯與金額通過。
- 新三尺寸 E2E 第一次使用錯誤 fixture slug，已停止該輪、由 runner 清理 DB，修正為 gb- 格式後重新驗收中。
- 容量腳本初次缺少 NODE_ENV，階段診斷定位於 load-service，已明確設定 production + 隔離 test env；待重新執行。

## 下一個安全操作

1. 完成新增 390/768/1440 Chromium 操作測試，檢查截圖與 overflow／pageerror。
2. 執行修正後容量腳本、完整 PostgreSQL 整合、lint/typecheck/unit/build。
3. 以最終 Linux 映像跑既有容器 DB/worker 故障恢復與回退演練。
4. 完成成本／設計規範／驗收矩陣，檢查 Git 差異與遠端 CI/Security。

此 checkpoint 並非全專案完成宣告。最終結果以 `docs/qbuy-quality-acceptance.md` 及最終 commit 的實際測試為準。

## 2026-10-29 checkpoint 收斂

本機完整結果：unit 1,971 passed／163 skipped 另列；交易 runner 166 passed／0 skipped；Auth runner 23 passed（2個真PG案例＋21個安全guard）；Chromium 23 passed／0 skipped；typecheck、Prisma validate、lint、development 零 drift、私有截圖還原、資源限制下 Linux DB／worker 故障恢復與歷史相容皆通過。完整 npm audit（含 dev）0 vulnerabilities。

已完成必要安全修補與回歸，最終截圖、驗證摘要及 SHA256 保存到 `docs/evidence/2026-10-29`。本機 test DB 已確認無遺留，原始 main 乾淨，保留22 migrations、18 Order、18 OrderItem、0 QbOrder。

後續安全操作為審查整合差異及最後 HEAD 的 GitHub CI／Security。完整交付與外部 No-Go 邊界見 `docs/qbuy-quality-acceptance.md`；未自行部署或取得外部交易授權。
