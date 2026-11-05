# 實際驗證記錄

2026-11-06 · Windows／Node 24.15.0／Next 16.4.1／既有 npm lockfile。這份記錄分開說明成功、修正前失敗與尚未執行的外部驗收。

## 最終結果

| 實際指令 | 結果 |
| --- | --- |
| `git fetch origin` | 成功；由最新 `origin/main` 7d15beb 建立獨立 worktree／分支 |
| `npm ci` | 成功；631 packages，沒有升級依賴。當次回報既有 8 moderate，未自動修補或更新 lock |
| `npm run prisma:generate` | 成功；只產生已忽略的 Prisma client |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過，含 Prisma generate、Next typegen、tsc strict |
| `npm test` | **2073 passed／164 skipped**；130 files passed、9 files skipped。跳過者是既有需明確開啟的整合測試，不計成功 |
| `npm run prisma:validate` | 通過；schema 未修改 |
| `npm run build` | 通過；最終程式 production build；新增 `/admin/more` 正常編譯 |
| `npm run test:e2e`（`E2E_DIAGNOSTICS=1`） | **22 passed／0 skipped**；含 runner 自建隔離 DB、production build、消費者與 ADM 完整既有流程；成功後清理其臨時 DB |
| `npm run adm:preview:seed` | 成功；專屬合成 DB，30 Checkout／23 QbOrder／31 FulfillmentGroup；沒有 seed 來源開發 DB |
| `npm run adm:preview:verify` | 通過；30 情境、工作佇列、分頁、庫存及外部服務停用 |
| `npm run adm:preview:test` | **20 passed／0 skipped**，約2.1分鐘；20張最終截圖、2張第一輪比較圖。失敗及修正另列，沒有移除失敗測試 |
| `git diff --check` | 通過 |
| `git diff --name-only origin/main -- prisma package.json package-lock.json src/lib src/components/consumer src/app/globals.css` | 無差異；Schema、migration、依賴、服務與消費者共用樣式未變更 |

## 瀏覽器覆蓋

七個指定 viewport：320×720、375×812、390×844、768×1024、910×868、1024×768、1440×900。額外覆蓋 844×390 橫向、1024×500 短桌面、320px＋200% 字體、長合成帳號，以及帳號開啟時跨 1024 斷點。

- 每個尺寸：實際總覽、More 十個入口、帳號、購買／正式訂單、詳情、無水平溢位、正常捲動及底部表單操作。
- 手機／平板使用真實 Playwright `tap()`；桌面滑鼠；另驗證 Tab、Shift+Tab、Enter、Escape、背景點擊與返回焦點。
- More 每個入口真的點入並用瀏覽器返回；直接 URL、重整、query／hash 歷史、深層路由及父層選中狀態。
- 購買紀錄與正式 QB 訂單分別驗證 row 類型／數量；舊制入口必須指向 `/admin/orders`；銀行設定保持完整 `?settings=1#settings` 並真的展開。
- 既有 ADM preview 測試保留 30 筆真實詳情、付款／取消／退款／物流狀態、搜尋、空資料與 20＋10 分頁；另檢查商品編輯、團購編輯、實際 SKU 流水帳及新增維護頁。
- 本次新增慢速 RSC 導覽、pending／aria-busy／disabled 登出、登出後受保護 More 重導向，以及確定性的訂單讀取錯誤→移除故障→retry 重新取資料。
- 完整 E2E 保留舊制訂單所有五類詳情操作、人工核帳、正式建單、取消、退款、物流、退回／重寄，以及消費者回歸；未刪除或放寬交易斷言。

本機 ADM 預覽資料留存供使用者操作。只有測試資料，不含正式個資；LINE／銀行與物流外部送出均停用，沒有啟動 worker。

## 修正前實際失敗

| 失敗 | 原因與處理 |
| --- | --- |
| 沙箱 `git fetch`／本機 PG 連線 | `.git/FETCH_HEAD` 與 loopback 連線權限受限；使用已核准的範圍執行，沒有要求覆蓋原工作 |
| 首次 seed | 新 worktree 尚未 generate Prisma client；只重建本次 marker／隨機名稱均核實的未完成 DB，generate 後成功建立；來源 DB 不變 |
| 首次 `npm test` | Windows sandbox 暫存模組 cache rename EPERM，139 suites 沒有載入、**沒有測試成功**；改於允許環境完整重跑2073通過 |
| 首次完整 ADM | 登入 redirect 會將焦點放入內容，測試錯把下一個 Tab 當成初始文件順序；改成新文件後驗證第一個 Tab 與 skip link |
| 深層頁測試 | 串流 loading 尚未換成真實內容便盤點連結；先等待實際編輯／庫存入口，保留數量及操作斷言 |
| pending 登出測試 | 按鈕名稱從「登出」變成「登出中…」，舊 role name locator 不再匹配；改用 dialog 內的 submit button，保留 disabled／aria-busy／文字及真實登出斷言 |
| 故障復原測試（實際產品問題） | 讀取恢復後 `reset()` 沒有重新取資料，列表仍為0筆；依本機 Next 文件改 `retry()`，同一故障流程成功恢復20筆。測試 hook 不寫資料或修改 schema |

上述失敗日誌與 trace 保存在本機已忽略的 `.temp/`；PR 只納入必要合成截圖與可重現測試，沒有大量 trace、暫存編譯輸出、資料庫 dump 或登入 manifest。

## 修改檔案

- `src/app/admin/(protected)/layout.tsx`：保留 requireAdmin，統一 Header／Sidebar／底欄。
- `src/app/admin/(protected)/more/page.tsx`、`loading.tsx`：分類功能頁與內容載入。
- `src/app/admin/(protected)/qbuy/error.tsx`：UI 重試改為 refetch 的 retry，交易與權限不變。
- `src/components/admin/admin-nav.tsx`、`admin-header.tsx`、`admin-icon.tsx`、`navigation.ts`、`admin.module.css`：共用導覽、帳號、路由與固定介面樣式。
- `e2e/adm-preview.pw.ts`、`adm-shell.pw.ts`、`adm-failure.pw.ts`、`e2e/helpers/adm-read-fault.mjs`、`playwright.adm.config.ts`：維持原場景，新增導覽、各尺寸、故障復原及隔離測試。
- `tests/admin/navigation.test.ts`、`tests/orders/admin-source.test.ts`：28項路由／入口回歸及原邊界斷言更新。
- `.gitignore`、`docs/ui-guidelines.md`、本文件目錄：本機 Skills 排除、設計規則、決策／逐張審查、必要 PNG 與 evidence manifest。

## 尚未執行與風險

- 沒有聲稱實體 iOS Safari／Android、NVDA／VoiceOver、真實裝置 safe-area、真實外部銀行／物流／LINE 驗收通過；本次使用 Chromium 觸控／鍵盤模擬及程式化安全區留白。
- 一般 unit 模式的164項整合測試仍跳過；本輪未另執行獨立 auth／order integration runner，不能把跳過者列入2073通過。
- 既有 pg concurrent-query deprecation 與 npm moderate 議題留待依賴／資料層專案處理，本次沒有擅自升級或改業務服務。
- 可操作的本機資料會依使用者合法操作改變；seed 不覆蓋。若要重設，只能用原工具核實擁有權後明確 clean → seed。
- 等待使用者確認分類、文字與實際營運流程；保留 Draft，不自動 merge 或部署。

## PR

Draft PR 連結於建立後補入；基準與來源檔案／截圖 SHA256 記錄於 evidence.json。
