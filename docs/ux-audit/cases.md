# 驗收案例與證據界線

基準為 PR #73 `ccbc461198789b4ff351f1ae9866df6c06a2585d`。所有資料變更、銀行與物流流程均在 runner 自有的隨機隔離 PostgreSQL DB；LINE 真實推播／物流外部操作保持關閉。

## 按互動類型驗收

|類型／範圍|操作與適用維度|測試來源|
|---|---|---|
|全站頁面與控制名稱|29 頁實際資料、七尺寸溢出、欄位 label、按鈕／連結名稱、圖片 alt、平面文字對比、跳至主內容、每個可見 summary 的鍵盤 Space 開關|`e2e/zz-ux-audit.spec.ts`；執行控制清單存於 `route-results.json`|
|初次空資料|商城、購物車、結帳、我的訂單及全部後台列表／工作台；配送能力未設定時不能送出；404 可恢復導覽|`e2e/00-ux-empty.spec.ts`|
|真實 Loading／Error|全部 29 頁串流載入邊界、`aria-busy`、安全錯誤提示、避免重複交易說明及重試；故障不顯示 Prisma／憑證|`e2e/zy-ux-boundaries.spec.ts`、`tests/ui/fallbacks.test.tsx`|
|Admin 登入|正確／錯誤密碼、登入錯誤關聯、保留 Email、禁用中狀態；未授權路由拒絕|`01-ux-form-errors`、`admin-auth` E2E；`tests/auth`、隔離 Auth runner|
|商品／供應商／取貨點表單|新增、編輯、原生必填、伺服器錯誤、保存中、錯誤後資料保留；停用取消確認／核准停用／重新啟用；小螢幕操作|`01-ux-form-errors`、`02-ux-catalog`、`phase-1` E2E|
|圖片／舊制開團|多圖上傳、排序、封面、移除、商品／取貨點排序、草稿與發布、既有訂單庫存鎖定、舊制下單與存取|`phase-1.spec.ts`；`tests/group-buys/gallery*`、`tests/images/*`|
|SKU／庫存／分類|預設 SKU、顏色尺寸稀疏組合、停啟用 SKU、INITIAL／RESTOCK／REDUCE／COUNT、版本與永久流水帳、翻頁、分類新增／改名／排序／停啟用、販售價格／限購／合併配送、上架／下架／封存|`02-ux-catalog`、`qbuy-milestone-1` E2E；commerce／SKU unit 和隔離整合|
|購物車|跨團共用 SKU、不同團價、改量、刪除、改價接受、截止／下架／不足、重新驗證、登入後保留、多分頁同步、損毀儲存與明確清除、成功購買只清理相符項目；選店草稿依帳號隔離、跨分頁改量保留收件人編輯|`qbuy-milestone-1`、`qbuy-experience`、`zz-ux-audit`；`tests/commerce/cart.test.ts`|
|結帳|姓名手機地址驗證、宅配／7-ELEVEN／全家、權威門市、選店返回保留資料、報價、各群運費／免運／等待時間、慢速雙擊、返回／重整、報價變動及庫存競爭|`qbuy-milestone-2`、`qbuy-experience`、`zz-ux-audit`；shipping／checkout 整合|
|交易回應中斷|讓真實 create 已成功後丟棄回應，顯示中文連線錯誤；用原識別碼重試回到既有購買，斷言只有一次購買與一次預留|`zz-ux-audit` 的 lost checkout acknowledgement 案例|
|付款回報|六小時期限、銀行資訊、末五碼、私有圖片上傳、MIME／大小／解碼／ownership、待人工確認／逾期／入帳待建單／正式 QB|`qbuy-milestone-2/3` E2E；`tests/checkout`、交易 runner|
|Admin 核帳與例外|核帳搜尋／分頁、銀行／費率／全家設定、銀行證據、臺灣時間、少匯／多匯／補差額、原子建多張 QB、重複拒絕、異常／逾期重建或退款義務|M2／M3 E2E；`tests/qbuy/transaction-forms`、checkout 整合。少匯／多匯等部分罕見條件由真 PG service／route 測試驗證，未冒稱每一條件都點過獨立瀏覽器表單|
|取消退款物流|顧客申請、Admin 核准、運費重算、PROCESSING→實際退款二次確認、合併群組物流、連續事件、退回實收、品檢、重寄費與新物流、無二次扣庫|M3 與 `zz-ux-audit` E2E（撤回、拒絕、核准、退款異常恢復、品檢不合格再查核）；`tests/qbuy/lifecycle-panel` 覆蓋取消 5、退款 4、物流 8、退回 5 種呈現與按鈕條件；真 PG lifecycle／shipment concurrency|
|舊制訂單後台|完整搜尋、篩選保留、雙向分頁、核款、取貨、取消、交寄／到店／退回／作廢、不可逆確認與重整|`admin-order-operations`、`phase-1` E2E；`tests/orders`|
|營運與通知|存活／就緒最小資訊、權限、worker 心跳與佇列、安全開關、失敗重試與去重|`operations` 與 `03-ux-notifications` E2E（provider 拒絕、驗證成功、撤回同意、安全重試、超限拒絕、零 delivery）、`tests/operations`、`tests/integration/operations`／`qbuy-lifecycle`。真實 LINE 接受／已讀與外部寄件不在此驗收內|

## 矩陣使用方式

`inventory.json`／`interactions.md` 逐來源列出 361 個 JSX 位置，包括 hidden payload、共用表單實例、disabled 屬性、條件分支與欄位選項；來源列不是 361 個獨立瀏覽器測試。`route-results.json` 另列每頁實際渲染控制（名稱、型別、停用與 details 隱藏狀態），兩者應一起檢閱。

驗收證據分為真實瀏覽器操作、真 PostgreSQL 業務規則、元件條件與靜態來源盤點；不可將來源盤點或只出現於元件測試的條件改列為「瀏覽器逐按鈕通過」。

範圍限制：並未對每個表單任意欄位錯誤值的所有排列組合、每種業務狀態在七尺寸的所有操作重新建立獨立瀏覽器案例。罕見條件同時使用 service／route／元件保護；報告只把列明的實際操作與狀態計為通過，不能據此聲稱所有可能輸入與排列都已窮舉。沒有可達的財務／物流／通知控制因預設資料看不到而從來源矩陣刪除。

手機原生鍵盤／實機螢幕閱讀器、背景圖或透明度影響的文字對比須人工評估。自製對比檢查僅檢查已渲染平面色彩文字，不是 axe、完整 WCAG 自動稽核或 AA 認證；沒有為此新增套件。
