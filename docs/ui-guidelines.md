# QBUY UI Guidelines

2026-10-28：依全專案品質指令完善現有 Tailwind／React 元件，不引入 UI 套件或重寫交易流程。

## 品牌、色彩與文字

- 品牌固定「QBUY 快易購」；Admin 為「快易購營運管理」。
- `src/app/globals.css` 定義品牌 `--brand: #92400e`、hover `#78350f`、底色 `#fafaf9`、白色 surface 與 muted `#57534e`。
- 成功用 emerald、等待／需確認用 amber、錯誤用 red、中性／結案用 slate。狀態須同時用文字說明，不能只靠顏色。
- 延用 Geist 與繁體中文系統字型 fallback。正文／表單 16px，頁面標題 24px／桌面 30px、區塊標題 20px／桌面 24px、卡片標題 18px；首頁主視覺保留 40px。標題取用 `titleStyles`。
- 金額為新臺幣。財務與營運日期固定 Asia/Taipei，表單的 datetime-local 也按臺灣時間解析，不使用瀏覽器所在地解讀。

## 共用元件與版面

- `src/components/ui/primitives.tsx` 是按鈕、欄位、PageHeader、Card、Section、EmptyState、ErrorNotice、DetailList 的共用入口。
- 每個原生 button、操作連結與表單欄位必須使用共用 token。按鈕依 primary／secondary／danger 選用；LINE 登入使用明確的 `line` 變體，圖片箭頭／縮圖使用 `icon`／`thumbnail`。響應式 submit 使用同一 token，僅用 `hidden`／`sm:inline-flex` 控制顯示。
- 按鈕最小 44×44px、14px／600 字重、8px 圓角；icon 為 44×44px、縮圖為 80×64px。所有變體共用 focus／disabled；同變體共用 hover／active。已選導覽使用 `aria-current`，縮圖以 `aria-current=true` 標示。
- 欄位使用 `fieldStyles`（16px、最小高 44px、8px 圓角），checkbox／radio 使用 `checkStyles`，其 label 至少高 44px；選項卡使用 `choiceStyles`，選取及鍵盤焦點由同一規格處理。
- 返回、查看、前往、客服及頁首等帶 URL 的操作文字使用有明確表面的按鈕外觀；保留 `Link`／`a` 的導頁語意，不換成按鈕 JavaScript 跳轉。不得使用 `linkStyles.inline` 或無外框的 `textAction` 呈現這些入口。整卡、列、品牌、深色 Admin 導覽與跳至內容保留各自的整體互動變體。
- 展開區塊使用 `disclosureStyles`；錯誤／成功／一般資訊／待確認回饋使用 `messageStyles`。一般卡片圓角 12px，僅首頁主視覺保留較大圓角。
- `status-badge.tsx` 沿用語意狀態色。Checkout 文案集中 `lib/checkout/presentation.ts`，新舊 Order 不共用交易狀態機。
- 顧客頁使用 `CustomerPageShell`，主內容 max-width 4xl／6xl／7xl；Admin 使用既有 sidebar 與可水平捲動的局部導覽／表格。
- 整頁不得水平溢出；長名稱可換行，選單與表單可縮小。只允許必要資料表在自己的容器內水平捲動。
- 表格編號、電話、狀態徽章及操作按鈕保持完整文字；`tableStyles` 將操作欄固定在右側，捲動時仍可點擊。不得以把訂單編號或短操作詞拆成多行的方式勉強縮欄。
- 通用按鈕／輸入／select／summary 最小高度 44px，鍵盤 focus-visible 有可辨識外框，提供「跳至主要內容」。
- 使用者啟用減少動態效果時停用平滑捲動與非必要動畫。

## 商品與結帳

- SKU 規格、價格、可售數量、限購、停售／截止顯示於同區，預選可購買規格；加入購物車成功明說尚未預留。
- SKU 商品不可同時顯示「0 項商品」或「沒有可供訂購商品」等舊制空狀態。
- 購物車保留失效行供修正；有待驗證／失效行時不呈現可直接結帳入口。storage clear 與跨分頁修改須重新驗證。
- Checkout 只顯示選用方式的宅配／超商欄位。確認前逐群組列出商品、溫層、小計、運費、免運條件及最晚截止等待；合組／免運／價格仍由伺服器計算。
- 付款證明成功僅代表已回報；REPORTED／RECEIVED／FINALIZED 必須有各自下一步。
- 待退款、退款處理中、實際已退款、退款異常分別顯示。核准取消不代表退款完成；LINE API 接受不代表顧客已讀。
- 客服只連至已設定的官方 LINE URL；未提供時明示尚待設定，不杜撰聯絡帳號。

## 回饋與安全操作

- 載入用 root loading skeleton，非預期頁面錯誤用 error boundary 的 `retry`（依安裝版本 Next 文件）；不顯示 DB／secret 原始錯誤。
- 表單有必填 label、loading、disabled、成功 role=status、失敗 role=alert。財務／不可逆操作保留二次確認及原始證據。
- 表單使用同步 ref 防止同一輪重複提交。已收到成功回應才更換冪等 requestId；失敗或不確定回應保留 key 供安全重試。
- 不把可讀性改善當作刪除財務證據的理由；稽核與銀行證據可收在 details，但需清楚入口。
- 測試與截圖使用隔離合成資料。390px、768px、桌面要實際完成操作、比對資料庫及檢查溢出／錯誤，不能只驗證可載入。

## 全站一致性驗收

- `scripts/lib/ui-consistency.ts` 以 TypeScript AST 檢查全站互動元件，別名必須追溯至共用 primitives 的 import；原生 button、欄位、連結與 summary 遺漏 token 會使測試失敗。共用按鈕不得被頁面局部色彩、尺寸、圓角與互動 utility 覆蓋。唯一隱藏檔案欄位例外須置於共用按鈕 label 中並有明確名稱。
- `tests/ui/consistency.test.ts` 納入一般 unit gate。新頁面會自動加入 E2E 路由清單；動態路由未提供 fixture 會直接失敗，不可默默略過。
- `e2e/qbuy-experience.spec.ts` 在 390／768／1440px 逐頁檢查 29 個 page 路由，展開 details 後量測可見控制項的尺寸、字型、圓角、停用、勾選 label、圖片載入及頁面 overflow；另實測主要按鈕 hover／focus、圖片切換、配送切換、鍵盤訂購與跨團結帳。
- 逐頁 JSON、每頁截圖輸出至 `test-results/qbuy-experience-*/`；固定證據與驗收範圍見 [全站驗收紀錄](ui-consistency-acceptance.md)。原始碼控制點覆蓋與已操作的交易狀態分開記錄，不把掃描通過宣稱為所有狀態組合均已點擊。
- 選店過渡與測試門市為獨立 HTML，使用 `standalone-page.ts` 的同一按鈕規格，以 CSP 樣式雜湊放行；不得使用 `unsafe-inline`。來源規範與三尺寸瀏覽器檢查一併涵蓋這兩個畫面。

## 既有 UX 稽核的保留規則

- 共用 `FormField` 關聯欄位與錯誤；Admin 編輯表單驗證失敗後保留輸入。
- `fieldset` 可縮小到小螢幕容器；庫存表格提供鍵盤可聚焦的捲動區。
- Checkout 選店返回原流程；session 草稿與 requestId 依顧客帳號分開，成功後清除，跨分頁更新保留當前收件資料。
- 先前的路由／互動、七尺寸、真實 Loading／Error 與特殊業務流程證據見 [ux-audit](ux-audit/README.md)；本輪樣式續作以最新 [全站驗收紀錄](ui-consistency-acceptance.md) 為準。
