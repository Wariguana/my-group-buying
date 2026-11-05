# UI Guidelines

2026-11-01 消費者端定稿：Responsive／Sticky Header、分類微互動、商品卡與缺圖、購物流程、Footer／Accordion 及協助頁採用已驗收版本。消費者 UI 位於 `src/components/consumer`，暖白基礎規則限定 `.qbuy-customer-page`；ADM 與原共用元件維持 main 規格。條款／隱私未核定，Production 僅提供未發布狀態。依賴隔離、品質檢查及限制見 [定稿驗收](consumer-ui-finalization/README.md)。

- The customer frontend is mobile-first.
- Admin UI prioritizes operational efficiency over decorative dashboard UI.
- Reuse components instead of duplicating patterns.
- Provide accessible labels and interactions.
- Provide clear loading, error, and empty states.
- Destructive operations require confirmation.
- Do not define a full visual design system yet.


## ADM V1 可理解性與工作台準則

- 適用情境：初期單人營運，但畫面必須讓未參與開發的授權協助人員理解；手機及電腦同等重要。
- 主要導覽採用營運用語，例如「工作總覽」「訂單管理」「付款確認」，不以 Checkout、Finalize、SKU 等技術名詞作為一般使用者的唯一提示。
- Checkout 是一次「購買紀錄」，QbOrder 是正式成立的「QB 訂單」，FulfillmentGroup 是「配送群組」。三者不得混稱，也不可相加作總訂單數。
- 「顧客已回報轉帳」不等於「銀行已確認入帳」；「有退款義務」不等於「已完成退款」；物流人工記錄不能誤稱自動串接。
- 頁面先說明目的、需要處理的事與下一步；稽核、系統識別碼、通知重試等資訊歸入進階區塊，但不得隱藏合法必要操作。
- 工作台各數字標示單位、清楚定義並連到相符的篩選結果；不同工作佇列可能重疊。
- 手機採卡片、桌面採足夠資訊密度；測試 320、375、390、768、1024、1440px，避免整頁水平溢出。
- 抽屜與可展開元件必須正確管理 Esc、焦點、背景捲動與 reduced-motion；操作不可只靠顏色表達。
- 對高風險的核帳、退款、取消、庫存及出貨流程保留服務端檢查、明確確認與稽核。
- 開發用模擬交易畫面必須清楚標示非真實資料，Production 不可對外提供，不能把 UI 預覽當成實際交易流程測試。

## ADM 固定介面（2026-11-06）

- 1024px 以下：總覽／訂單／商品／更多四個連結；「更多」使用 `/admin/more` 正常頁面捲動，平板入口集中於 576px 寬度，不另設導覽抽屜或 Rail。
- 1024px 起：232px 固定側欄、五個營運分類；側欄內容可獨立捲動，主內容使用文件捲動。Header 提供目前分類與共用帳號入口。
- 路由、名稱、圖示及選中狀態以 `src/components/admin/navigation.ts` 為單一來源；購買紀錄、正式 QB 訂單、舊制訂單和銀行設定必須維持不同入口。深層路由、query、hash 及返回都要驗證。
- 固定介面限定使用 `--adm-*` tokens：暖白背景、深棕品牌區、橘色互動；不改消費者樣式。導覽 14px、說明 13px（rem，隨使用者設定放大），操作目標至少 44px，圓角 8–12px，間距以 4px 為基準。
- Hover／Pressed 使用底色回饋；Active 同時使用字重、背景／指示條和 `aria-current`。保留 2px `focus-visible`，深色背景使用淺橘焦點色，不因滑鼠截圖而移除鍵盤焦點。
- 帳號使用各尺寸共用的原生 modal dialog：背景 inert、鎖定捲動、Tab 循環、Escape／背景關閉及返回觸發鈕焦點。登出沿用原 Server Action 與 pending／disabled 狀態。
- 切換內容保留 Shell；使用 Next loading boundary 與連結 pending 提示。既有頁面錯誤、空資料及交易表單狀態繼續保留。
- Header／底欄納入 safe-area，內容與錨點預留固定列高度。新互動只使用 120ms 顏色變化；reduced-motion 時停止過渡。

完整決策、路由清冊、Skills、實測及截圖見 [固定介面驗收](adm-shell-uiux-20261106/README.md)。
