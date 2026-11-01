# QBUY 消費者端 UI/UX 定稿與版本隔離

2026-11-01，Asia/Taipei。消費者視覺驗收已由使用者確認；本次整理已完成成果，未新增交易功能或部署。

## Git 基準與前置依賴

- 原工作目錄：`D:/my-group-buying`，branch `codex/qbuy-ui-streamline-20261029`，HEAD `69731b9fc3e5cd9b78849494856fc85cf89bfc23`。
- Fetch 後 main：`0c76ed5a8f552c8de01bbc25ca8cd4ade79496f4`。
- 本次分支：`codex/qbuy-consumer-final-20261101`，直接由 main 建立；工作樹 `D:/qbuy-consumer-finalization`。
- 原工作樹含多輪尚未提交的消費者及 ADM 工作；1666 個原有 tracked／untracked 檔案已記錄 SHA256，隔離與驗證期間全部保持原值。未 stash、reset 或覆蓋原工作。

| PR | 檢查時狀態／HEAD | 範圍與依賴 |
| --- | --- | --- |
| [#73](https://github.com/Wariguana/my-group-buying/pull/73) | Open，`ccbc461198789b4ff351f1ae9866df6c06a2585d` | 消費者購買說明、前端回饋與安全依賴，同時包含 ADM 表單修改 |
| [#74](https://github.com/Wariguana/my-group-buying/pull/74) | Open，`1d06c7a1db0f8ca7ddcf40a938a053179bb168fd` | 建立在 #73 上，含全站控制項、消費者流程與 ADM 樣式 |
| [#75](https://github.com/Wariguana/my-group-buying/pull/75) | Open／Draft，`69731b9fc3e5cd9b78849494856fc85cf89bfc23` | 建立在 #74 上，含商城精簡、ADM 工作台、管理查詢與監控 |

本次沒有合併上述整支 PR 或 cherry-pick 其整個 commit。以檔案及必要依賴整理消費者快照，直接對 main 提交，因此不必先合併混有 ADM 的前置分支。三支舊 PR 與原工作樹保留，後續 ADM 工作須另行審查。

## 保留的消費者成果

- 1440px Desktop、768px Tablet 與 390／360／320px Mobile；既有固定比例圖片、商品 Grid、長名稱、實際 SKU 價格與整卡導覽。
- Sticky Header、搜尋 Dialog、我的訂單、購物車與帳號真實 Avatar／原登出流程。
- 分類立即 optimistic 回饋、共享橘色指示條、pending 提醒、局部水平揭露、快速切換的最新結果及 reduced-motion。
- SVG 缺圖 Placeholder；正常、載入中及失敗狀態沿用同一圖片框高。
- 團購詳情、跨團購物車、配送分組報價、付款回報、我的訂單與退款／履約說明。
- 共用暖白 Footer、九個有效連結、Mobile 獨立 Accordion；230ms 展開／200ms 收合／190ms Plus-Minus、固定 500 字重、inert、ARIA 與 reduced-motion。
- `/help` 與 `/help/ordering`、`payment`、`delivery`、`refunds`、`faq`、`about`、`contact`、`terms`、`privacy`。

營運主體與正式客服仍未定；條款／隱私權仍未核定。Production 不輸出草稿正文，顯示未發布狀態且 noindex；Development／Staging 才可預覽草稿。這次合併不解除既有 Go-Live 阻塞。

## ADM 隔離方式

1. `src/app/admin`、`src/components/admin`、`src/lib/admin`、`src/lib/operations`、`src/lib/qbuy` 與原 `src/components/ui`／`src/components/qbuy` 的既有檔案保留 main 版本。
2. 消費者使用 `src/components/consumer` 下的已驗收 UI 快照，消費者 Lifecycle 只保留顧客顯示與取消／撤回入口，沒有 ADM 管理控制項。
3. 暖白底色、字型及一般元素的基礎規則限定於 `.qbuy-customer-page`，保留 main 的 body 色彩、字型及 ADM 原控制項。未使用的 ADM 導覽／資料表新樣式不攜入。
4. 不攜入 #75 的管理工作台、佇列抽象及監控 projection，也不攜入未核准的全站 root fallback 改造。
5. 保留 main 原有 E2E 測試，更新已變更的消費者定位；新加的 UI 稽核與 responsive 斷言僅針對本次消費者範圍。未合併 ADM 的新增案例保留在原分支。

這是版本隔離，沒有新增查詢架構或全域狀態管理。待 ADM 驗收後可另行評估兩側共用元件收斂。

## 必要依賴與安全邊界

- 沿用已驗收的 Next／ESLint 16.4.1、Zod 4.6.6、Vitest 4.1.12 及既有 lockfile 安全版本，不執行自動 audit fix 或額外升級。
- Checkout service 僅增加既有 quote 的配送群組顯示投影；報價、價格、庫存、付款及所有 mutation 規則不變。購物車已確認購買後的選擇性清理及中斷回應提示保留。
- 商城公開 projection 增加既有 salePrice 的最低價／價差呈現；狀態與歷史資料不改寫。
- 超商選店的既有回傳／重試及 CSP 樣式對應為消費者依賴；測試入口仍受原環境限制，Auth／權限規則不變。
- Prisma schema 與 migrations 無變更。Development DB 唯讀驗證前後筆數一致；交易／Auth／Browser 使用一次性本機隔離 DB。
- 不提交 `.env`、憑證、DB rows／dump、Development 圖片、暫存資料、node_modules 或 build artifacts。供預覽的圖片副本已核對並移除。
- 只逐一加入核對後的檔案；沒有 `git add -A`。一般 Merge Commit，保留分支，不部署 Production。

## 驗證與已確認限制

最終本機結果見 [verification.json](verification.json)，遠端 CI／Security 以 PR 相同 HEAD 的實際結果為準。

- Lint、typecheck、production build。
- 全部 unit：2030 passed／163 skipped，124 files passed／9 skipped。未將 skipped 計入成功。
- 隔離交易 integration：166 passed；隔離 Auth integration：23 passed。
- 完整 Browser regression：22 cases，包含 main 原有流程、新商城七種寬度、首頁 → 詳情 → 購物車 → 結帳 → 訂單查詢，以及取消退款／物流歷史。
- 五尺寸 × 十份協助頁：50 筆預覽與 50 筆草稿關閉分支；Footer 正常／減少動畫、鍵盤、Touch、快速反向、收合 Tab 排除。
- 分類額外驗證：390／360／320px × 正常／減少動畫共六筆，含延遲 RSC、快速切換、查詢一致性與捲動；Development DB 不變。
- 圖片額外驗證：1440／768／390／360／320px 五筆，含正常、缺圖、載入與失敗、長名稱及導覽；Development DB 不變。
- Footer 對照：[1440](footer-1440.png)、[768](footer-768.png)、[390 收合](footer-390.png)／[展開](footer-open-390.png)、[320 收合](footer-320.png)／[展開](footer-open-320.png)。五張與人工驗收版本 SHA256 相同；320px 收合僅「關於 QBUY」截圖時的 Hover 顏色不同，已逐像素確認差異只在該標題／Plus 的範圍，尺寸與排列一致。這些圖只含靜態導覽，不含顧客或商品資料。
- npm audit：0 high／0 critical，16 moderate，主要是開發工具鏈；沿用既定 High／Critical gate，後續依賴維護另列，不自動降版或強制升級。
- Browser 為 Chromium viewport／touch 模擬，未聲稱實體手機或 Safari／Firefox 驗收。

實際失敗及處理：

| 情況 | 原因與處理 |
| --- | --- |
| 首輪 CI Auth integration 失敗 | 測試 guard 只允許本機 5433，但原 CI 服務使用 5432。補齊 #73 runner 的兩個配套測試：只允許 loopback 的 5432／5433 與既有一次性 DB 前綴，繼續拒絕外部主機、其他 port 及 Development DB。沒有修改 Runtime Auth、移除測試或略過 gate。 |
| 初次隔離 unit 的兩個銀行時間案例失敗 | 該新增案例測未核准的 ADM 銀行表單；原 main 表單不含這項續作。保留 main 原有測試，只納入消費者新增案例，原 ADM 案例與修正完整留在原分支。 |
| Browser 導覽／退款文字定位失敗 | 測試仍期待 #75 的 ADM 文案；定位改回 main 既有「訂單管理」及原退款 reason，保留狀態與金額斷言。 |
| ADM 連續物流事件失敗 | main 的既有表單成功後仍持有同一 requestId。保留 main 原測試每次成功後 reload 的操作步驟，並保留額外的 DB／追蹤狀態斷言。此 ADM 限制與 #73 續作修正留待下一階段；本次不宣稱已修正。 |
| 唯讀圖片預覽最初無正常圖片 | Development DB 引用原工作樹本機素材，而候選分支刻意未攜入。僅預覽暫時提供素材並重啟 Next 更新 public 清單，五尺寸驗證通過後清理副本，沒有提交素材或改 DB。 |

重現檢查（使用經既有 guard 允許的本機環境）：

```powershell
npm ci
npm run lint
npm run typecheck
npm run test -- --maxWorkers=2
npm run test:integration:orders
npm run test:integration:auth
npm run build
npm run test:e2e
```

尚待事項：未核定的營運／法律／外部服務依賴、ADM 續作、實機與其他瀏覽器、moderate 開發依賴維護。沒有 Production 部署或 Development DB 清除。
