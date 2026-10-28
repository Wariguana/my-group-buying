# QBUY UI Guidelines

2026-10-28：依全專案品質指令完善現有 Tailwind／React 元件，不引入 UI 套件或重寫交易流程。

## 品牌、色彩與文字

- 品牌固定「QBUY 快易購」；Admin 為「快易購營運管理」。
- `src/app/globals.css` 定義品牌 `--brand: #92400e`、hover `#78350f`、底色 `#fafaf9`、白色 surface 與 muted `#57534e`。
- 成功用 emerald、等待／需確認用 amber、錯誤用 red、中性／結案用 slate。狀態須同時用文字說明，不能只靠顏色。
- 延用 Geist 與繁體中文系統字型 fallback。正文與表單以 16px 為基準，頁面標題 24–36px、段落有清楚間距。
- 金額為新臺幣。財務與營運日期固定 Asia/Taipei，表單的 datetime-local 也按臺灣時間解析，不使用瀏覽器所在地解讀。

## 共用元件與版面

- `src/components/ui/primitives.tsx` 是按鈕、欄位、PageHeader、Card、Section、EmptyState、ErrorNotice、DetailList 的共用入口。
- 按鈕依 primary／secondary／textAction／danger 選用，既有特殊響應式 submit 可延用相同品牌色及焦點樣式。Admin 深色導覽屬導覽面板，不是另一套按鈕設計。
- `status-badge.tsx` 沿用語意狀態色。Checkout 文案集中 `lib/checkout/presentation.ts`，新舊 Order 不共用交易狀態機。
- 顧客頁使用 `CustomerPageShell`，主內容 max-width 4xl／6xl／7xl；Admin 使用既有 sidebar 與可水平捲動的局部導覽／表格。
- 整頁不得水平溢出；長名稱可換行，選單與表單可縮小。只允許必要資料表在自己的容器內水平捲動。
- 通用按鈕／輸入／select／summary 最小高度 44px，鍵盤 focus-visible 有可辨識外框，提供「跳至主要內容」。

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
