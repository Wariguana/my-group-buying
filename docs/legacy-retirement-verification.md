# 舊制清理與新版保留：驗證紀錄

2026-11-07，本機 `D:\my-group-buying`。沿用 [Draft PR #79](https://github.com/Wariguana/my-group-buying/pull/79) 的 `codex/adm-shell-uiux-20261106` 遠端分支；未合併或部署。

## 本輪處理

- 移除舊固定取貨地點的列表、新增、編輯、actions、專屬服務與驗證；導覽不再提供舊訂單或固定取貨設定。
- 移除未使用的舊 Order dashboard、團購商品／取貨選項 loader、舊發布錯誤碼與舊 POST 封鎖分支；保留商城開放旗標。
- 團購基本資料不再回送舊商品、自取與取貨關聯。strict schema 拒絕舊欄位注入；更新只改現行基本資料、圖片與 7-ELEVEN 設定，不改寫歷史 rows。新團購固定不啟用舊自取。
- 商城搜尋、價格、價差與售完狀態只讀現行 SKU offers，不再受舊商品價格／庫存影響。
- 修正協助中心、草稿／發布提示與現況文件，避免引導使用已退役的操作。
- More 現為 8 個次要入口。ADM E2E 依導覽清單核對數量與各入口，並明確排除舊路由，不再依賴過期的 10 個入口常數。
- ADM 測試從同一原專案執行，使用 `.temp/adm-preview/next` 編譯快取，與已在 3000 執行的日常開發服務並存，不另外建立 checkout/worktree。

## 最終本機結果

| 檢查 | 結果 |
| --- | --- |
| `npm run check` | lint、typecheck、unit、production build 全部通過 |
| Unit | 87 files、897 passed；7 files、90 tests 因整合環境旗標 skipped，未算成功 |
| `npm run prisma:validate` 的同等已安裝 Prisma CLI | schema valid |
| Commerce integration runner | 7 files、88 passed，包含真實 DB 歷史關聯保留及舊欄位注入拒絕 |
| Auth integration runner | bootstrap 8、login/session 15，共 23 passed |
| Screenshot backup/restore | 非空 bytea、SHA256、付款關聯與 Checkout 金額還原通過 |
| 完整 production Chromium E2E | 19 passed、0 skipped，約 1.9 分鐘 |
| ADM seed / verify | 30 種情境、23 筆 QB 訂單、31 個配送群組與狀態／關聯核對通過 |
| ADM Chromium | 20 passed、0 skipped，約 2.3 分鐘 |
| `git diff --check` | 通過 |

實際直接執行的整合／瀏覽器入口為 `node --import tsx scripts/run-commerce-integration.ts`、`scripts/run-auth-integration.ts`、`scripts/verify-screenshot-restore.ts`、`scripts/run-e2e.ts`，以及 `node node_modules/@playwright/test/cli.js test --config playwright.adm.config.ts`。這些就是 package scripts 對應的已安裝工具；沒有升級依賴。

完整 E2E 覆蓋登入保護、SKU 商品／團購基本資料與圖片、已發布 SKU-only 編輯、舊網址 404、手機銀行設定驗證／未儲存離開、協助中心、購物車、三團 Checkout、付款證明、人工核帳、QB 建單、取消申請、退款、配送、退回與重寄，以及商城首頁。

ADM 覆蓋 320、375、390、768、910、1024、1440px，含觸控／鍵盤、More 全部入口與返回、查詢／錨點、30 筆真實合成詳情、200% 文字、長帳號、登出、短側欄、慢速導覽，以及受限讀取失敗後重試復原。

## 最新畫面

下列三張是本輪測試產生並逐張檢視的合成資料截圖：

- [390px More 上半部](legacy-retirement/screenshots/more-390.png)：舊訂單與固定取貨設定已移除；標題、分組、卡片及固定底欄清楚，無水平溢出。
- [390px More 下半部](legacy-retirement/screenshots/more-bottom-390.png)：銀行／配送、通知、系統狀態及帳號可正常捲動到達，帳號／登出不被底欄遮擋。
- [910px More](legacy-retirement/screenshots/more-910.png)：8 個次要入口分成兩欄，帳號與底欄完整，沒有舊取貨入口。

原 `adm-shell-uiux-20261106` 截圖、checksum 與測試數量保留為歷史快照，不代表本輪現況。移除的測試僅對應已退役功能，現行流程與新增保護測試均保留。

## 資料安全與限制

- 未修改 Prisma schema、已套用 migrations、依賴版本或 `.env.example`；未存取正式資料庫。
- 保留歷史 Order／OrderItem／Shipment／GroupBuyItem／GroupBuyPickup／PickupLocation 資料及 SKU 庫存切換守門條件。
- 保留新版 7-ELEVEN、全家、宅配、銀行、通知與部署控制。整合及 E2E 僅使用 runner 建立並驗證的本機合成資料庫，外部推播／物流關閉。
- 首次 ADM 執行因既有 3000 服務占用相同 Next dev lock 而未啟動；改用專用快取後重跑 20/20 通過。沒有停止使用者的日常服務。
- 尚未驗證實體 Safari／Android／讀屏工具或真實銀行、LINE 推播、物流交易。既有 pg deprecation 警告未在本輪升級處理。
- 遠端 CI 應以 PR 最新 commit 的 Actions 結果為準，本文件只記錄已實際完成的本機檢查。
