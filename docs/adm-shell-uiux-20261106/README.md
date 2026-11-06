# QBUY ADM 固定介面驗收

> 歷史交付紀錄：目前開發版已移除舊制訂單流程。現況以 [舊流程退役紀錄](../legacy-order-retirement.md) 與目前程式為準。

2026-11-06 · 獨立分支 `codex/adm-shell-uiux-20261106` · [Draft PR #79](https://github.com/Wariguana/my-group-buying/pull/79)，等待營運人員人工驗收。

## 基準與範圍

- Repository：`Wariguana/my-group-buying`。fetch 後 `origin/main`：`7d15beb0635950b5ff9acc5b044650ee5c3cf9a2`，已合併 #78。
- 原工作區 `D:/my-group-buying`：`codex/qbuy-ui-streamline-20261029`／`69731b9fc3e5cd9b78849494856fc85cf89bfc23`，既有大量修改完整保留。
- 本次 worktree：`D:/my-group-buying/.temp/adm-shell-20261106`，由乾淨的最新 main 建立。沒有合併尚未整合的 #73、#74、#75；其餘 open PR 為依賴更新。沒有改寫既有分支。
- 僅修改 ADM Shell、導覽、相關 loading／More 路由、驗證及文件。消費者 UI、Prisma schema、22 個既有 migration、交易服務、認證／授權與依賴 lock 均不變。

## 原始問題與決策

原先底欄「更多」打開與桌面相同的完整左抽屜。手機出現兩套重複主導覽；910px 仍須開抽屜；功能多時產生獨立長捲動。路由定義直接內嵌於元件，payments 的 query／hash 沒有選中狀態，notifications 深層路由被當成購買紀錄。正式 QB 與舊制訂單也缺少清楚的固定入口。實際故障驗證另發現：QB 的 `reset()` 只清除錯誤，沒有重新取資料，恢復服務後仍無法重試；依已安裝 Next 文件改用 `retry()`，只修復 UI 復原行為。

| 方案 | 可理解性／效率 | 空間與維護 | 決定 |
| --- | --- | --- | --- |
| A 優化抽屜 | 仍需理解底欄與重複選單，額外開關 | 需要 modal、背景鎖、跨斷點與長選單焦點處理 | 不採用作功能導覽 |
| B 四入口＋More 頁 | 四個固定入口；次要功能有中文分類、描述；原生連結支援返回／新分頁 | 768／910px 留足內容寬度，More 可兩欄；手機／平板共用規則 | **採用**；桌面固定 Sidebar |
| C 底欄＋Rail＋Sidebar | 平板拇指距離可能縮短 | 需第三套斷點與狀態；80px Rail 讓 768／910px 在 24px gutters 後從 720／862px 降至 640／782px（另計間距則更窄） | 訂單卡片／表單受損，沒有足夠收益證明，暫不採用 |

參考 [shadcn sidebar](https://ui.shadcn.com/blocks/sidebar) 的分類與獨立內容區、[shadcn-admin](https://github.com/satnaing/shadcn-admin) 的營運導覽密度，以及 [Android 導覽模式](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) 的有限主要入口與自適應原則。Android 建議寬螢幕 Rail；本案按實際 Web 內容寬度與維護成本選擇 B，並以 768／910px 瀏覽器實測驗證。沒有安裝 shadcn、圖示框架或 Rail 依賴。

## 資訊架構與完整路由

下表是 UI 歸屬；權限仍由既有 server boundary 執行。

| 路由 | 桌面分類／選中項目 | 手機／平板 |
| --- | --- | --- |
| `/admin` | 工作台／工作總覽 | 總覽 |
| `/admin/qbuy`、`?view=purchases`、查詢／狀態／分頁 | 訂單與交易／訂單管理（購買紀錄） | 訂單 |
| `/admin/qbuy?view=orders` | 訂單與交易／正式 QB 訂單 | 訂單；More 提供直接正式視圖入口 |
| `/admin/qbuy/[id]`（含詳情錨點） | 訂單與交易／訂單管理 | 訂單 |
| `/admin/payments`（核帳篩選） | 訂單與交易／付款確認 | 更多 |
| `/admin/orders`、`/admin/orders/[publicCode]` | 訂單與交易／舊制訂單 | 更多 |
| `/admin/products`、`/new`、`/[id]/edit` | 商品與團購／商品管理 | 商品 |
| `/admin/group-buys`、`/new`、`/[id]/edit` | 商品與團購／團購管理 | 更多 |
| `/admin/commerce`（product／group query） | 商品與團購／商品規格與庫存 | 更多 |
| `/admin/inventory/[skuId]` | 商品與團購／商品規格與庫存；由現有 SKU 頁進入 | 更多 |
| `/admin/suppliers`、`/new`、`/[id]/edit` | 商品與團購／供應商管理 | 更多 |
| `/admin/pickup-locations`、`/new`、`/[id]/edit` | 營運設定／取貨地點 | 更多 |
| `/admin/payments?settings=1#settings` | 營運設定／銀行與配送設定，直接展開原設定 | 更多 |
| `/admin/payments#settings` | 設定錨點位置；不改原本 details 開合規則 | 更多 |
| `/admin/qbuy/notifications` | 系統管理／通知對象；不誤選訂單管理 | 更多 |
| `/admin/operations` | 系統管理／系統狀態 | 更多 |
| `/admin/more`、`#account` | 更多功能索引／管理帳號 | 更多 |
| `/admin/preview/orders` | 既有開發靜態預覽，保留直接 URL 與原 Production 禁用規則 | 更多歸屬，非營運功能清單 |
| `/admin/login` | 既有登入頁，Shell 外 | Shell 外 |

More 的十個次要入口不重複總覽、購買紀錄首頁及商品首頁；正式訂單是同一路由的不同合法視圖，與購買紀錄分開說明。未知／重複 view query 的選中狀態跟隨既有 server parser 回落到購買紀錄，不改任何業務參數判斷。

## 設計規則與可重用元件

規則限定 ADM，沒有建立全站新設計系統。

| 元素 | 規格 |
| --- | --- |
| 品牌／畫布 | 深棕 `#342f2b`；暖白 `#fbf9f5`／`#fffdf9`；正文 `#40372f`、次要 `#746b62`、邊線 `#e6dfd6` |
| 互動 | 品牌橘 `#b64e18`；選中背景 `#fff0df`、文字 `#9d4319`；淺色區鍵盤外框 `#bd5b29`，深棕區外框 `#ffc38d` |
| 文字 | 保留現有 Geist／繁中系統後備字；新導覽 14px、說明 13px、功能標題 15px；以 rem 支援放大；桌面分類 12px |
| 間距／圓角 | 4px 基準，8／12／16／20／24px；功能區間 24／28px；8–12px 圓角 |
| 圖示 | 自有 24×24 viewBox 線性 SVG，1.8 stroke，顯示 18／20px；文字旁圖示 `aria-hidden`，不額外安裝 icon 包 |
| 操作尺寸 | 導覽及帳號至少 44px；More 列至少 72px 並可隨長文字增高；手機底欄至少 68px＋safe-area |
| 響應式 | <640px 單欄 More；640px 起兩欄；<1024px 底欄入口集中於 576px；≥1024px 232px Sidebar。內容文件捲動，僅側欄及必要帳號 dialog 可獨立捲動 |
| Header | sticky 60px＋top safe-area；小螢幕品牌／帳號，大螢幕位置／帳號。320px 縮短品牌副標保留操作空間 |
| 狀態 | Hover／Pressed 底色；Active 背景＋字重＋ARIA，側欄增加指示條。保留 focus-visible、跳至內容；不以移除焦點掩蓋問題 |
| 等待／失敗／空資料 | Shell 不隨內容替換；Next loading boundary、連結 pending 提示。既有 QB error／empty／invalid-id 與表單錯誤保持；登出 pending／disabled 沿用原按鈕 |
| 帳號 | 原生 showModal、背景 inert、Tab／Shift+Tab、Escape／背景點擊、關閉與返回焦點；全尺寸共用觸發鈕，切尺寸不留下隱藏 modal |
| 動畫／安全區 | 僅 120ms 色彩過渡，reduced-motion 停止；Header／底欄的 env insets 與內容 padding／錨點 scroll-margin 一致 |

`navigation.ts` 是 Sidebar／More／Header／底欄的路由來源；`AdminIcon` 統一圖示；`AdminNav` 只處理導覽；`AdminHeader` 只處理位置與帳號。More 重用既有 PageHeader、Link primitives、LogoutButton 及原 logoutAdmin Server Action。

## Skills 與研究

三項均先檢查全域與專案，未有既有安裝；使用已審閱的內建 skill-installer 安裝於本 worktree `.agents/skills/`。未執行遠端 shell、CLI 安裝器或改動 npm 依賴。Skills 本身為本機設計工具，以 `.gitignore` 排除整包第三方資料／上游測試，PR 留來源及重現方式。

| Skill／來源版本 | 實際使用 | 選擇性未採用 |
| --- | --- | --- |
| [Frontend UI Engineering](https://github.com/addyosmani/agent-skills/tree/301b02b12bff98e4688e6984af6556802322bbde/skills/frontend-ui-engineering) | 參考先行、元件責任、品牌一致、44px 操作、原生語意與焦點；另讀 accessibility-checklist | 不引進新目錄架構／Storybook／狀態套件 |
| [Vercel Web Design Guidelines](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines) | 取得當次最新 command.md，審查本 PR 的 label、焦點、URL、長文字、safe-area、motion 與載入 | 非本次範圍的既有業務頁不全面重寫 |
| [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/b7d5353e0130feb8c5574ef1251f8a1db1873ccb/.claude/skills/ui-ux-pro-max) | 審閱 search/core/design_system/reasoning 的本機讀檔與可選寫檔路徑；執行 design-system、keyboard focus modal（ux）與 navigation suspense loading（nextjs）；讀 quick-reference/pro-rules | design-system 命中通用 glassmorphism／深色／Fira 建議與本案不符，明確拒用；未 persist、未裝 GSAP、未載入外部字體；Next 建議以本機 16.4.1 文件覆核 |

已手動讀取並在本輪套用；安裝目錄及 frontmatter 經檢查。自動 discovery 須以這個 worktree 為工作目錄開啟後續 Codex 回合才能驗證，原工作目錄不會自動掃描子 worktree 的 Skills；本工作階段未熱載入，也沒有為此中斷工程或重複安裝。搜尋僅用通用設計詞，沒有提供私有資料。

可用內建 `skill-installer/scripts/install-skill-from-github.py`，分別指定上述 repo、`--ref` SHA、`--path skills/frontend-ui-engineering`／`skills/web-design-guidelines`／`.claude/skills/ui-ux-pro-max` 及 `--dest <worktree>/.agents/skills` 重現。不要覆蓋已存在安裝。

實際使用的本機 Next 文件：`01-app/01-getting-started/03-layouts-and-pages.md`、`04-linking-and-navigating.md`、`10-error-handling.md`、`03-api-reference/04-functions/use-pathname.md`、`use-search-params.md`、`02-components/link.md`、`03-file-conventions/error.md`，位於已安裝 `node_modules/next/dist/docs/`；亦查核 generate-agent-files.js 及 error-boundary.js 的 retry／reset 差異，保留原 AGENTS managed 區段。

## 視覺迭代與驗證

見 [逐張視覺審查](visual-review.md) 與 [實測結果](verification.md)。截圖均為 Chromium、隔離合成資料；只隱藏 Next 開發工具浮層，未隱藏產品控制或修改交易內容。帳號截圖保留鍵盤操作後可見的焦點。

本機重現：

```powershell
cd D:\my-group-buying\.temp\adm-shell-20261106
npm ci
npm run prisma:generate
# 僅設定既有 runner 允許的 loopback 測試來源，禁止使用正式連線。
npm run adm:preview:seed
npm run adm:preview:verify
$env:ADM_SHELL_EVIDENCE_DIR='docs/adm-shell-uiux-20261106/screenshots'
npm run adm:preview:test
npm run adm:preview
```

瀏覽 `http://127.0.0.1:3200/admin`；登入資訊只在已忽略的 `.temp/adm-preview/manifest.json`，本機可用 `npm run adm:preview:info` 查看。不要把帳密放到 issue、PR、截圖或 log。seed 已有完成環境時重用，不覆蓋交易資料；本次保留環境供人工操作。執行 `adm:preview:test` 前先停止手動預覽：測試要求自行啟動專用 server，不再盲目重用 3200 上的其他工作區服務。

故障驗證只在 Playwright 的開發 server 程序載入 `e2e/helpers/adm-read-fault.mjs`：必須同時符合測試旗標、`QBUY_ENV=test`、loopback 及隨機隔離 DB 名稱。只有測試 marker 存在時拒絕 Checkout SELECT，從不改資料、DB 設定或 schema；marker 在 finally 清理。正式應用程式沒有匯入此 hook。瀏覽器實測錯誤畫面保留 Header／底欄、移除故障後按重試恢復真實列表。

## 交付與限制

- 本次沒有 Production 資料存取、正式部署、自動合併或遠端 main 推送。
- 實機 Safari／iOS／Android、螢幕閱讀器及真實銀行／物流／LINE 驗收未宣稱通過；本次為 Chromium 鍵盤與觸控模擬。
- 商品／付款等既有業務頁只驗證在新 Shell 中的入口、選中與排版，未將其內部表單重新設計。舊制歷史詳情有路由單元測試及既有完整 E2E，不用 QB 合成資料冒充舊制交易。
- 使用者仍需確認營運名稱與功能分類。這份成果保持 Draft，不能當作已正式定稿。
- 完整修改清單、最終測試與 PR 連結記錄於 verification.md。
