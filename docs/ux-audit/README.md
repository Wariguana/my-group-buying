# QBUY 全站 UI／UX 驗收紀錄

2026-10-29 精簡重構續作的最新結果見 [全站精簡驗收](../ui-streamline/README.md)。本目錄的來源清單已更新；以下舊輪次的測試數與截圖維持歷史紀錄，不替代新版本驗證。

日期：2026-10-29（Asia/Taipei）。工作目錄 `D:/my-group-buying`，分支 `codex/qbuy-ux-audit-20261029`。

後續全站一致性工作已在獨立工作樹整合本版本 `7698ab8`，涵蓋 29 頁＋2 個選店 HTML 畫面／57 處按鈕，最新 unit 2,017 passed、E2E 34 passed。最新規格、逐頁 JSON、截圖及驗收結果見 [UI 一致性驗收](../ui-consistency-acceptance.md)。本目錄以下盤點及證據保留首次 UX 稽核的原始版本，不以舊截圖或舊 SHA 的 CI 取代新版本驗證。

基準為 PR #73 最新 HEAD `ccbc461198789b4ff351f1ae9866df6c06a2585d`，不是舊 main UI。開始時 root working tree 乾淨，main／origin/main 為 `0c76ed5a8f552c8de01bbc25ca8cd4ade79496f4`；PR #73 仍 open、未合併，該 HEAD 的 verify／trivy 成功。原獨立品質工作樹保留，不覆蓋它的檔案。依使用者明確授權執行 `npm ci` 同步既有 lockfile，沒有新增、升級或刪除依賴規格。

## 驗收狀態

本文件是可續作、可查證的驗收紀錄。最終命令、通過／失敗與遠端 CI 結果記於 `verification.json`；不得引用先前 SHA 的 CI 當成本分支成功。來源矩陣與瀏覽器證據分開紀錄，不把靜態盤點當作逐按鈕操作完成。

- [42 個實際路由](routes.md)：29 頁面與 13 Route Handlers，含用途、角色、進入條件、來源、layout、依賴與互動關聯。
- [361 個互動來源位置](interactions.md)、[Route Handler HTML 控制](handler-interactions.md)與 [完整 JSON](inventory.json)：欄位、按鈕、連結、summary、共用表單、條件分支、payload 與 Client／Server 邊界。
- [逐頁狀態與尺寸結果](page-state-results.md)：實際 Normal／Empty／Loading／Error 的範圍。
- [操作案例與證據界線](cases.md)：明確區分瀏覽器、真 PG、元件及來源證據。
- [設計規格](design-system.md)與 [既有 UI Guidelines](../ui-guidelines.md)。
- [問題修正對照](fixes.md)。
- [本機驗收數據](results.md)與 [機器可讀驗證紀錄](verification.json)。
- [截圖及 SHA256 索引](evidence/index.json)。所有畫面均為隔離合成資料。

正常頁面巡覽：320／375／390／430／768／1024／1440px；320／390／768／1440 保存完整圖片。所有主要頁面另操作真實 streaming Loading 及 DB 連線失敗 Error（390px），首次空資料畫面七尺寸。特殊交易狀態、表單儲存中與錯誤、通知／退款／品檢等另存。

## 重現

先確保 loopback-only 的核准 development／CI PostgreSQL 可用，以及 Chromium 已安裝。runner 只由該連線建立自己的隨機隔離 DB，結束後清理；不向 development 寫入新業務資料。

```powershell
node --import tsx scripts/ux-inventory.ts
npm run lint
npm run typecheck
npm run test -- --maxWorkers=2
npm run test:integration:orders
npm run test:integration:auth
npx prisma validate
npm audit --audit-level=high
$env:E2E_DIAGNOSTICS='1'
npm run test:e2e
node --import tsx scripts/ux-evidence.ts
npm run build
```

最後的證據匯整只接受 Playwright `.last-run.json` 為 passed、來源 SHA256 相符且不存在溢出／缺少名稱／平面文字對比問題的結果。證據產生腳本不會把失敗輪次包裝成通過。截圖時間、測試帳號與編號是動態合成值，未聲稱有逐像素正規化比對。

Windows 沙箱會阻擋部分 Temp rename、loopback socket 與 `.git` 寫入，需在同一工作目錄提升該命令權限；這是本機工具限制，不是把失敗測試算作成功。首次 `npm ci` 的原生模組鎖來自此專案原本的 Next dev；僅停止已確認的專案程序後完成同步。

## 資料安全與完成界線

Prisma schema 及既有 22 個 migrations 不變；不重設、回填或更動原 development 業務資料。Loading 故障注入僅鎖隔離 DB session 表並 rollback；Error 伺服器用不存在的隔離測試帳號，不改正式或 development 憑證。

銀行入帳／退款全為隔離模擬；LINE provider 與 consent 使用合成身分、push 明確關閉，斷言沒有 delivery；物流 map 使用 guarded fixture。沒有購買雲端、部署 Production、真實匯款、寄件或對外通知。未自行合併 PR #73。

尚缺的正式外部驗收沿用 [Go-Live Dependency Matrix](../go-live-dependencies.md)：真實 LINE OAuth／推播與封鎖、銀行實收退款、物流交寄到店與退回、客服營運、條款／個資政策、正式雲端及外部備份恢復。實機手機鍵盤、螢幕閱讀器與完整 WCAG 2.2 AA 人工驗收仍須分開執行。這些不能由 Chromium 或零個對比問題推論為通過。
