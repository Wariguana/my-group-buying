# 問題與修正對照

|優先序|重現問題|修正|保護性證據|
|---|---|---|---|
|P1|跨團 Checkout 的 7-ELEVEN 選店回到舊商品頁，使用另一個 token 名稱，無法繼續原購買|明確固定 `flow=checkout` 的 callback，回到 `/checkout?selectionToken=…`；保留舊制 callback；不允許任意回跳網址；同一分頁收件草稿依顧客帳號隔離、成功後清除；跨分頁變更不回填舊草稿覆蓋當前編輯|start／callback route 單元、open redirect 拒絕、7-ELEVEN 完整 UI 建單與 DB 預留斷言|
|P1|快速輸入姓名／手機會更新表單 revision，使尚未完成的購物車驗證被丟棄，選店按鈕不出現|分離 cart revision 與報價 revision；購物車變更才使選店 slug 查詢過期|延遲回應元件測試、實際選店流程|
|P2|Admin 商品／供應商／取貨點／開團表單回傳驗證錯誤後，自動 reset 清空剛輸入的資料|成功本來就 redirect 的編輯表單阻止原生自動 reset，保留修正需要的輸入；不變更 Server Actions／交易邏輯|四類表單實際 server error、saving、保留欄位 E2E|
|P2|欄位錯誤視覺可見但未關聯輸入；多條訊息重複同一 ID|共用 `FormField`，一個 error 容器、`aria-invalid`、`aria-describedby`；登入錯誤亦關聯帳密並保留 Email|元件錯誤關聯與清除測試、錯誤密碼及四表單 E2E|
|P2|開團編輯頁有取貨資料時 320px 整頁多出 1px|清除 fieldset 原生 min-content，允許表單在小畫面收縮；未隱藏整頁 overflow 掩蓋內容|29 頁 × 七尺寸幾何斷言|
|P2|本機購物車 JSON 損毀時顯示原始英文 SyntaxError|validation 層提供中文損毀訊息；保留資料，必須確認後才清除|單元、雙分頁損毀及恢復操作|
|P2|顧客退款原因顯示 `CANCELLATION` 等內部代碼|集中中文退款原因；未知原因請洽客服；隱藏的舊 enum 不送入螢幕閱讀器|四退款狀態元件、M3 UI 與退款異常恢復|
|P2|顧客取消／撤回缺少具體後果確認|說明 QB 對象與暫停／恢復出貨；確認訊息不把多餘欄位加入嚴格 customer payload|取消確認 payload 單元、取消／撤回／拒絕 UI|
|P2|QB 工作台空結果缺少下一步，搜尋欄位在窄畫面缺少可縮規則|沿用 EmptyState／fieldStyles／buttonStyles，顯示調整篩選建議|空狀態七尺寸與正常巡覽|
|P2|庫存表格缺少鍵盤捲動入口，窄畫面中文表頭被擠成直排|完整與最近流水帳採具名 region、tabIndex 與 44rem 最小欄寬，僅容器橫捲|320px 流水帳鍵盤 ArrowRight 及分頁 UI|
|P2|輸入提示文字偏淡，未套共用欄位的搜尋提示量得 3.69:1|加深共用／舊制 placeholder，提供全站基本文字色；自動掃描涵蓋 placeholder|逐頁平面文字／placeholder 對比檢查|
|P2|顧客看到 DEFAULT UUID、SKU 術語與配送 enum|預設規格、規格標題與配送溫層中文化；只改顯示，不更動 SKU 身分或歷史 snapshot|純顯示函式測試、實際商品／購物車／付款與訂單頁|
|P2|檔案輸入 visually hidden 時缺少可見的鍵盤焦點|上傳 label 提供 focus-within 外框，原生檔案控制仍可鍵盤操作|新增／編輯開團頁的實際隱藏控制焦點檢查|
|P3|部分次要／文字／危險按鈕與 SKU 表單尺寸不一致|共用按鈕至少 44px，commerce 欄位沿用 fieldStyles|七尺寸、控制名稱與平面文字對比輔助掃描|

沒有修改庫存 locking、ledger、取消／退款／物流狀態機或財務計算 service。斷線重試、通知上限、品檢與退款錯誤恢復為新增保護性驗收，不是改寫已驗證交易核心。

失敗輪次包含：Windows 模組鎖／Temp 權限、一次 Vitest worker 意外結束、測試 fixture 違反預設 SKU 與舊訂單快照約束、選擇器與 Next route announcer 衝突、用可變名稱定位改名後表單，以及已重現的產品問題。測試資料與選擇器已修正；沒有放寬 DB 約束、刪除既有測試或將失敗／skipped 當成成功。
