# QBUY 設計與互動規格

沿用 [UI Guidelines](../ui-guidelines.md)，以現有 Tailwind 與共用元件落實，不增加 UI framework。

|元素|規則／實作|
|---|---|
|品牌與功能色|`globals.css`：brand `#92400e`、hover `#78350f`；成功 emerald、警示 amber、錯誤 red、中性 slate。狀態同時提供中文文字|
|背景與 surface|頁面 `#fafaf9`，卡片白底；Admin 深色導航沿用品牌與一致焦點規則|
|字級與字體|Geist＋繁中 fallback；正文／輸入約 16px；H1 24–36px，H2 18–24px；手機不以小字輸入框換密度|
|版寬與間距|顧客 4xl／6xl，Admin 90rem；手機 padding 16–20px，桌面 24–40px；最小可縮寬度 0，fieldset 清除原生 min-content 限制|
|卡片|圓角 12–16px、淺邊框、輕陰影。重要價格、總額、下一步優先|
|按鈕|`buttonStyles` primary／secondary／textAction／danger，最小 44px；focus-visible 外框；disabled 與處理中文字；原生確認窗保留|
|Input／Textarea／Select|`fieldStyles` 白底、border-slate-300、圓角 8px、全寬及可縮小。原生輸入型態、autocomplete 與 required／min／max 先提供基本約束|
|Checkbox／Radio|品牌 accent；搭配可點文字 label；財務證據勾選不被 UI 調整移除|
|欄位錯誤|`FormField` 集中 label、單一 error ID、`aria-invalid` 與 `aria-describedby`，保留原有輔助說明；驗證失敗不得清空輸入。這四種 Admin 編輯表單成功時以 redirect 離開，所以阻止自動 reset，不影響成功流程|
|確認與對話框|原生 confirm 提供鍵盤及焦點管理；Admin 必須核對操作、金額與證據。顧客取消／撤回說明 QB 對象、暫停／恢復出貨後果；UI 確認不替代 server authorization|
|Badge 與文案|中文狀態、退款原因與下一步；舊 enum 的輔助隱藏內容不送給螢幕閱讀器；新舊 Order 狀態機保持分離|
|Loading／Skeleton|共用 root streaming loading，status 與 aria-busy；動畫尊重 reduced motion|
|Empty／Error／Success|共用 EmptyState、ErrorNotice；錯誤 role=alert、成功 role=status；工作佇列無資料顯示調整篩選建議；錯誤後有可恢復下一步|
|導航與手機選單|顧客 Logo、購物車、訂單與登入；Admin 局部水平導航／桌面側欄；跳至主內容。保留現在的手機導航，未重做不相關版面|
|表格與分頁|僅表格容器局部捲動；重要表格有具名可聚焦 region；分頁保留篩選並顯示方向。整頁不得溢出|
|商品與價格|商品圖片具名或裝飾隱藏、SKU 選擇僅列存在組合、商品／團價／庫存／限購在一起；庫存與金額以 server 重驗為準|
|結帳與總額|逐配送群組顯示小計、運費、免運與截止等待；回到選店原流程、保留當前分頁草稿；成功後清理草稿與相符購物車行|
|頁尾與客服|QBUY 品牌、臺幣與臺灣時間說明；客服只使用已設定官方網址。未設定時明示待設定|
|防重送與斷線|同步 ref／pending 防重送；已確認成功才換 requestId。回應中斷保留原碼，先確認既有紀錄再重試；不因儲存清理失敗掩蓋已成功購買|
|視覺證據|正常 29 頁 × 七寬度；四寬度保存圖片；首次空狀態、實際 Loading／Error、表單 saving／error 與主要財務／物流流程另存。時間／編號含合成動態值，未當成正規化 pixel diff|
