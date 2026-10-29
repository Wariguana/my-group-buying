# 互動來源矩陣

共 365 個 JSX 來源位置，包含條件內控制與共用表單實例。每個位置的完整屬性、disabled、條件、內容及頁面依賴在 inventory.json。陣列產生的規格／狀態選項須逐資料狀態驗證；來源數不是執行次數。

驗收維度：適用的正常、停用、焦點、鍵盤、防重送、成功、錯誤、重整、返回、權限、斷線、長文與七尺寸。導覽免財務副作用檢查；財務操作必須隔離、保留二次確認及資料庫斷言。

|來源|元件|名稱／操作|出現條件|狀態|
|---|---|---|---|---|
|src/app/admin/(protected)/commerce/form.tsx:9|form|<input type="hidden" name="operation" value={operation} /> <fieldset disabled={pending} className="flex flex-wrap items-end gap-3 disabled:opacity-60">{children} <button className={buttonStyles.primary} disabled={pending}>{pending ? "儲存中…" ||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/form.tsx:11|input|"operation"||hidden-payload-not-clickable|
|src/app/admin/(protected)/commerce/form.tsx:13|button|{pending ? "儲存中…" : "儲存"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:11|input|{name}||hidden-payload-not-clickable|
|src/app/admin/(protected)/commerce/page.tsx:13|input|{name}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:15|select|"isActive"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:35|Link|新增商品||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:35|Link|新增開團||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:35|Link|分類管理||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:36|form|<label className="min-w-0 w-full sm:w-auto">選擇商品<select className={inputStyle} name="product" defaultValue={product?.id ?? ""}><option value="">選擇商品</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}／{p.skuInventoryEnable||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:36|select|"product"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:36|button|管理商品 SKU||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:37|form|<label className="min-w-0 w-full sm:w-auto">選擇開團<select className={inputStyle} name="group" defaultValue={group?.id ?? ""}><option value="">選擇開團</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:37|select|"group"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:37|button|管理開團販售||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:38|Link|編輯商品資料|product|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:40|CommerceForm|"defaultSku"|!product.skus.length && !product.options.length；product|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:41|CommerceForm|"option"|product|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:41|Field|"新增規格維度（顏色／尺寸）"|product|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:42|CommerceForm|"value"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:42|Field|{`新增${o.name}選項`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:43|CommerceForm|"sku"|product|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:43|Field|"新增 SKU code"|product|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:43|select|"optionValueIds"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:46|CommerceForm|"skuEdit"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:46|Field|"SKU code"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:46|Field|"顯示資訊"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:47|select|"temperature"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:48|input|"shippingMethods"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:49|Field|"重量 g"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:49|Field|"長 mm"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:49|Field|"寬 mm"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:49|Field|"高 mm"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:49|Field|"配送限制"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:53|CommerceForm|"inventory"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:54|select|"kind"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:54|Field|"數量"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:54|Field|"原因（至少 3 字）"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:54|input|"confirmed"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:56|Link|查看完整庫存流水帳||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:57|summary|庫存異動紀錄（最近 30 筆）||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:60|Link|編輯開團基本資料|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:62|CommerceForm|"group"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:62|select|"categoryId"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:63|select|"visibility"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:64|select|"isFeatured"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:64|Field|"精選排序"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:65|select|"allowsCombinedShipping"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:67|CommerceForm|"offer"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:67|select|"skuId"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:67|Field|"開團價格 NT$"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:67|Field|"每次購物數量上限（空白不限）"|group|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:68|CommerceForm|"offer"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:68|Field|"開團價格 NT$"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:68|Field|"每次購物數量上限"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:70|CommerceForm|"category"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:70|Field|"新增分類"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:70|Field|"排序"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:71|CommerceForm|"category"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:71|Field|"分類名稱"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/commerce/page.tsx:71|Field|"排序"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:91|form|<fieldset disabled={pending} className="space-y-6 disabled:opacity-60"> <section aria-labelledby="basics-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"> <h2 id="basics-heading" className={titleStyles.c||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:97|Field|"團購名稱"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:98|input|"title"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:100|Field|"說明"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:101|textarea|"description"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:104|Field|"開始時間"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:105|input|"startAt"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:107|Field|"結束時間"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:108|input|"endAt"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:115|input|"gallery"||hidden-payload-not-clickable|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:121|input|"選擇圖片上傳"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:134|button|設為封面|index > 0|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:135|button|{`圖片 ${index + 1} 上移`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:136|button|{`圖片 ${index + 1} 下移`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:137|button|{`移除圖片 ${index + 1}`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:146|input|"items"||hidden-payload-not-clickable|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:150|button|新增商品||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:158|select|{`商品 ${index + 1}`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:180|input|"allowsSelfPickup"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:184|input|"allowsSevenEleven"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:189|input|"pickups"||hidden-payload-not-clickable|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:193|button|新增取貨地點||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:202|select|{`取貨地點 ${index + 1}`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:214|button|{pending ? "儲存中…" : submitLabel}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:214|Link|取消||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:223|input|<span className="mb-2 block text-sm font-medium">{label}</span> <input type="number" inputMode="numeric" min="0" max="2147483647" step="1" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={input||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:224|input|<span className="mb-2 block text-sm font-medium">{label}</span> <input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName} />||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:225|button|上移||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:225|button|下移||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/group-buy-form.tsx:225|button|移除||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/page.tsx:22|Link|新增團購草稿||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/page.tsx:36|Link|編輯草稿|groupBuy.status === "DRAFT"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/page.tsx:36|Link|編輯|groupBuy.status === "PUBLISHED"；groupBuy.status === "DRAFT"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/publish-group-buy-form.tsx:17|form|<h2 className={titleStyles.card}>準備發布</h2> <p className="mt-1 mb-4 text-sm text-emerald-900">發布前請確認商品、取貨地點與時間皆已正確設定。</p> {state.error && <p role="alert" className={messageStyles.error}>{state.error}</p>} <button type="submit" disabled={pend||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/group-buys/publish-group-buy-form.tsx:27|button|{pending ? "發布中…" : "發布團購"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/inventory/[skuId]/page.tsx:28|Link|← 返回商品庫存||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/inventory/[skuId]/page.tsx:35|Link|回最新紀錄|cursorId|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/inventory/[skuId]/page.tsx:36|Link|較早紀錄 →|rows.length > 30|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/layout.tsx:11|a|跳至主要內容||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/layout.tsx:29|form|<LogoutButton />||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/logout-button.tsx:9|button|{pending ? "登出中…" : "登出"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/operations/page.tsx:12|Link|重新載入監控|health|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:59|Link|全部||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:60|Link|待收款||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:61|Link|自取待取貨||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:66|Link|{label}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:70|form|"搜尋及篩選訂單"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:71|input|"queue"|input.queue|hidden-payload-not-clickable|
|src/app/admin/(protected)/orders/list-controls.tsx:75|input|"orderNumber"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:79|select|"status"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:85|select|"fulfillment"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:90|button|{pending ? "搜尋中…" : "搜尋"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/list-controls.tsx:91|Link|清除||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:42|Link|{result.error === "INVALID_QUERY" ? "清除條件" : result.error === "INVALID_CURSOR" ? "回最新" : "重試"}|!result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:48|Link|回最新|input.navigation；result.value.items.length === 0；!result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:48|Link|清除條件|filtered；input.navigation；result.value.items.length === 0；!result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:66|Link|查看訂單||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:76|Link|上一批|result.value.hasNewer && result.value.newerCursor；result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:76|button|上一批|result.value.hasNewer && result.value.newerCursor；result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:77|Link|下一批|result.value.hasOlder && result.value.olderCursor；result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:77|button|下一批|result.value.hasOlder && result.value.olderCursor；result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/page.tsx:78|Link|回最新|!input.navigation \|\| result.value.items.length > 0；result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/cancel-form.tsx:30|form|<input type="hidden" name="publicCode" value={publicCode} /> <fieldset disabled={pending} className="space-y-4 disabled:opacity-60"> <p className="font-medium text-red-700">取消後無法復原。</p> <p className="text-sm text-slate-600">管理員可在團購截止後取消訂單。<||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/cancel-form.tsx:31|input|"publicCode"||hidden-payload-not-clickable|
|src/app/admin/(protected)/orders/[publicCode]/cancel-form.tsx:36|button|{pending ? "取消處理中…" : "取消訂單"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/page.tsx:26|Link|‹ 返回訂單列表||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/page.tsx:75|Link|返回訂單列表||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/payment-form.tsx:33|form|<input type="hidden" name="publicCode" value={publicCode} /> <fieldset disabled={pending} className="space-y-4 disabled:opacity-60"> <p className="font-medium">應收總額：{amount}</p> <p className="font-medium text-red-700">收款後無法復原，且無法取消訂單。</p> <||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/payment-form.tsx:34|input|"publicCode"||hidden-payload-not-clickable|
|src/app/admin/(protected)/orders/[publicCode]/payment-form.tsx:40|button|{pending ? "收款處理中…" : "確認已收款"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/pickup-form.tsx:30|form|<input type="hidden" name="publicCode" value={publicCode} /> <fieldset disabled={pending} className="space-y-4 disabled:opacity-60"> <p className="font-medium text-red-700">取貨後無法復原，且無法取消訂單。</p> <p className="text-sm text-slate-600">請確認商品已交付||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/pickup-form.tsx:31|input|"publicCode"||hidden-payload-not-clickable|
|src/app/admin/(protected)/orders/[publicCode]/pickup-form.tsx:36|button|{pending ? "取貨處理中…" : "標記已取貨"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/shipment-forms.tsx:27|form|<input type="hidden" name="publicCode" value={publicCode} /> <fieldset disabled={pending} className="min-w-0 space-y-4 disabled:opacity-60"> <p className="text-sm text-slate-600">請先在 7-ELEVEN MyShip／交貨便建立取貨付款寄件，再將物流編號登錄於此。本系統不會建立外部寄件或透過 MyS||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/shipment-forms.tsx:28|input|"publicCode"||hidden-payload-not-clickable|
|src/app/admin/(protected)/orders/[publicCode]/shipment-forms.tsx:31|input|"trackingNumber"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/shipment-forms.tsx:33|button|{pending ? "登錄中…" : "登錄物流紀錄"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/shipment-forms.tsx:58|form|<input type="hidden" name="shipmentId" value={shipmentId} /> <fieldset disabled={pending} className="min-w-0 space-y-3 disabled:opacity-60"> {(operation === "VOID" \|\| operation === "RETURN") && <p className="text-sm text-amber-900">{trans||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/orders/[publicCode]/shipment-forms.tsx:59|input|"shipmentId"||hidden-payload-not-clickable|
|src/app/admin/(protected)/orders/[publicCode]/shipment-forms.tsx:63|button|{pending ? "物流處理中…" : transition.label}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:27|Link|<Card className="flex h-full items-center justify-between gap-4 p-5 transition group-hover:border-slate-300 group-hover:bg-slate-50 group-hover:shadow-md group-active:bg-slate-100 group-focus-visible:border-slate-400 group-focus-visible:rin||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:44|Link|<span>{task.label}</span> <span className="shrink-0 font-bold text-amber-900">{task.count} 筆 ›</span>||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:49|Link|全部 QB 訂單||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:50|Link|查看訂單||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:62|Link|全部舊制訂單 ›||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:89|Link|詳情 ›||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:112|Link|重新載入工作台|workspace|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:121|summary|舊制訂單待辦與最近紀錄|result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:122|Link|新增團購||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/page.tsx:122|Link|新增商品||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/form.tsx:15|form|{label}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/form.tsx:37|input|{field.name}|field.type === "hidden"|hidden-payload-not-clickable|
|src/app/admin/(protected)/payments/form.tsx:37|input|{field.name}|field.type === "checkbox"；field.type === "hidden"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/form.tsx:37|select|{field.label}|field.options；field.type === "checkbox"；field.type === "hidden"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/form.tsx:37|input|{field.label}|field.options；field.type === "checkbox"；field.type === "hidden"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/form.tsx:38|button|{busy ? "處理中…" : label}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:44|summary|銀行與配送設定||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:51|Link|待核帳／異常佇列||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:51|Link|全部購買與歷史紀錄||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:52|form|<input type="hidden" name="view" value={history ? "all" : "queue"}/> <label className="min-w-0 flex-1">搜尋核帳紀錄<input name="q" maxLength={100} defaultValue={q} placeholder="QB 編號、姓名或電話" className={fieldStyles}/></label> <button className={`${||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:52|input|"view"||hidden-payload-not-clickable|
|src/app/admin/(protected)/payments/page.tsx:52|input|"q"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:52|button|搜尋||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:58|a|查看私有轉帳截圖|c.payment?.bankReport|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:60|summary|確認銀行入帳／補差額||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:62|summary|異常及更正稽核||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:63|summary|逾期補單或退款義務||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:65|summary|入帳及操作稽核（臺灣時間）||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:66|Link|上一頁|pageNumber > 1|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:66|Link|下一頁|pageNumber * 50 < count|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/payments/page.tsx:66|Link|管理首頁||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/page.tsx:16|Link|新增取貨地點||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/page.tsx:28|Link|編輯||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:31|form|<fieldset disabled={pending} className="space-y-5 disabled:opacity-60"> <FormField label="地點名稱" name="name" required errors={state.fieldErrors.name}> <input id="name" name="name" required defaultValue={values?.name} className={inputClassNam||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:33|FormField|"地點名稱"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:34|input|"name"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:36|FormField|"地址"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:37|input|"address"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:39|FormField|"說明"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:40|textarea|"description"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:44|button|{pending ? "儲存中…" : submitLabel}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/pickup-location-form.tsx:47|Link|取消||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/status-form.tsx:14|form|<StatusButton isActive={isActive} />||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/pickup-locations/status-form.tsx:28|button|{pending ? "處理中…" : isActive ? "停用" : "啟用"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/page.tsx:18|Link|新增商品||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/page.tsx:30|Link|編輯||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:42|form|<fieldset disabled={pending} className="space-y-5 disabled:opacity-60"> <FormField label="商品名稱" name="name" required errors={state.fieldErrors.name}> <input id="name" name="name" required defaultValue={values?.name} className={inputClassNam||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:44|FormField|"商品名稱"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:45|input|"name"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:47|FormField|"商品說明"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:48|textarea|"description"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:50|FormField|"圖片網址"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:51|input|"imageUrl"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:53|FormField|"預設售價"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:54|input|"defaultPrice"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:56|FormField|"預設成本"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:57|input|"cost"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:59|FormField|"單位"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:60|input|"unit"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:62|FormField|"供應商"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:63|select|"supplierId"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:74|button|{pending ? "儲存中…" : submitLabel}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/product-form.tsx:77|Link|取消||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/status-form.tsx:14|form|<StatusButton isActive={isActive} />||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/products/status-form.tsx:28|button|{pending ? "處理中…" : isActive ? "停用" : "啟用"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:12|Link|{value}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:13|form|"搜尋履約案件"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:13|input|"queue"||hidden-payload-not-clickable|
|src/app/admin/(protected)/qbuy/page.tsx:13|input|"q"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:13|button|搜尋||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:15|Link|核帳與私有轉帳截圖||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:16|summary|通知狀態與重試||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:16|QbuyForm|"排入安全重試"|["BLOCKED","RETRY"].includes(e.status)|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:17|summary|操作稽核（最近 50 筆）||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:18|Link|上一頁|result.page>1|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:18|Link|下一頁|result.page*20<result.count|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:19|summary|LINE 通知對象人工驗證||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:19|QbuyForm|"記錄已核實通知對象"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/qbuy/page.tsx:19|QbuyForm|"停用此通知對象"|r.enabled|source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/page.tsx:16|Link|新增供應商||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/page.tsx:28|Link|編輯||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/status-form.tsx:14|form|<StatusButton isActive={isActive} />||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/status-form.tsx:28|button|{pending ? "處理中…" : isActive ? "停用" : "啟用"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:33|form|<fieldset disabled={pending} className="space-y-5 disabled:opacity-60"> <FormField label="供應商名稱" name="name" required errors={state.fieldErrors.name}> <input id="name" name="name" required defaultValue={values?.name} className={inputClassNa||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:35|FormField|"供應商名稱"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:36|input|"name"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:38|FormField|"聯絡人"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:39|input|"contactName"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:41|FormField|"電話"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:42|input|"phone"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:44|FormField|"LINE / 聯絡方式"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:45|input|"lineContact"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:47|FormField|"備註"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:48|textarea|"note"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:52|button|{pending ? "儲存中…" : submitLabel}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/(protected)/suppliers/supplier-form.tsx:55|Link|取消||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/login/login-form.tsx:11|form|"管理員登入"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/login/login-form.tsx:15|input|"email"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/login/login-form.tsx:21|input|"password"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/admin/login/login-form.tsx:26|button|{pending ? "登入中…" : "登入"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/cart/cart-client.tsx:46|button|重新載入購物車|error|source-inventoried-see-cases-and-runtime-evidence|
|src/app/cart/cart-client.tsx:48|Link|繼續購物|ready && !pending && !error && lines.length === 0|source-inventoried-see-cases-and-runtime-evidence|
|src/app/cart/cart-client.tsx:55|input|{`${item?.groupTitle ?? line.offerId}數量`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/cart/cart-client.tsx:56|button|移除||source-inventoried-see-cases-and-runtime-evidence|
|src/app/cart/cart-client.tsx:57|button|接受最新價格|item?.status === "價格已變動" && item.currentPrice !== null|source-inventoried-see-cases-and-runtime-evidence|
|src/app/cart/cart-client.tsx:61|button|重新驗價與庫存|ready && lines.length > 0|source-inventoried-see-cases-and-runtime-evidence|
|src/app/cart/cart-client.tsx:63|Link|前往跨團結帳|result && !pending && !error && result.items.length > 0 && result.items.every(item => !item.status)；ready && lines.length > 0|source-inventoried-see-cases-and-runtime-evidence|
|src/app/cart/cart-client.tsx:65|button|清除無效購物車|error|source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:99|Link|返回購物車|ready && !lines.length|source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:100|form|<input type="hidden" name="groupBuySlug" value={slug}/> <button disabled={busy} className={buttonStyles.secondary}>選擇 7-ELEVEN 門市</button>|slug；method === "SEVEN_ELEVEN"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:100|input|"groupBuySlug"|slug；method === "SEVEN_ELEVEN"|hidden-payload-not-clickable|
|src/app/checkout/form.tsx:100|button|選擇 7-ELEVEN 門市|slug；method === "SEVEN_ELEVEN"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:101|form|<p>共 {lines.length} 項商品；一次購買選擇一種配送方式。</p> <fieldset disabled={busy} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"> <label>收件人姓名<input name="customerName" value={draft.customerName} onChange={e => setDraft({ ...draft, ||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:104|input|"customerName"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:105|input|"customerPhone"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:106|select|"配送方式"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:107|select|"全家門市"|method === "FAMILY_MART"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:108|input|"address"|method === "HOME_DELIVERY"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:115|button|{busy ? "處理中…" : quote ? "確認金額並前往付款" : "計算配送與總額"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/form.tsx:120|Link|返回購物車調整商品||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/[id]/page.tsx:31|Link|我的訂單||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/[id]/page.tsx:35|summary|{o.orderNumber} · 已付款 NT$ {o.paidAmount}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/[id]/page.tsx:40|Link|取消申請、退款與配送進度||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/[id]/transfer-form.tsx:15|form|<p>{remaining === null ? "正在確認付款回報期限…" : `剩餘 ${Math.floor(remaining / 3600)} 小時 ${Math.floor(remaining % 3600 / 60)} 分 ${remaining % 60} 秒`}</p> <fieldset disabled={busy \|\| remaining === null \|\| remaining === 0} className="space-y-4"><l||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/[id]/transfer-form.tsx:38|input|"lastFive"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/[id]/transfer-form.tsx:39|input|"screenshot"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/checkout/[id]/transfer-form.tsx:40|button|{busy ? "送出中…" : "提交付款回報"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/error.tsx:5|button|重新載入||source-inventoried-see-cases-and-runtime-evidence|
|src/app/error.tsx:5|Link|查看我的訂單||source-inventoried-see-cases-and-runtime-evidence|
|src/app/error.tsx:5|Link|返回商城||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/public-ui.tsx:84|a|跳至主要內容||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/public-ui.tsx:86|Link|<span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden="true" /> QBUY 快易購||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/public-ui.tsx:89|Link|購物車||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/public-ui.tsx:97|Link|我的訂單|customerAccount|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/public-ui.tsx:103|form|<button type="submit" className={buttonStyles.secondary} > 登出 </button>|customerAccount|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/public-ui.tsx:104|button|登出|customerAccount|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/public-ui.tsx:113|a|LINE 登入|customerAccount|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/group-buy-gallery.tsx:47|button|"上一張圖片"|images.length > 1|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/group-buy-gallery.tsx:48|button|"下一張圖片"|images.length > 1|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/group-buy-gallery.tsx:53|button|{`顯示${title}圖片 ${index + 1}`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:248|a|查看訂單||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:268|form|<input type="hidden" name="groupBuySlug" value={slug} />|allowsSevenEleven|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:269|input|"groupBuySlug"|allowsSevenEleven|hidden-payload-not-clickable|
|src/app/group-buys/[slug]/order-form.tsx:272|form|<input type="hidden" name="groupBuySlug" value={slug} /> {!hasMultipleMethods && <input type="hidden" name="fulfillmentMethod" value={allowsSelfPickup ? "SELF_PICKUP" : "SEVEN_ELEVEN"} />} <fieldset disabled={pending} className="divide-y di||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:273|input|"groupBuySlug"||hidden-payload-not-clickable|
|src/app/group-buys/[slug]/order-form.tsx:274|input|"fulfillmentMethod"|!hasMultipleMethods|hidden-payload-not-clickable|
|src/app/group-buys/[slug]/order-form.tsx:285|input|{`price:${item.id}`}||hidden-payload-not-clickable|
|src/app/group-buys/[slug]/order-form.tsx:294|input|{`item:${item.id}`}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:307|input|"自取"|hasMultipleMethods|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:311|input|"7-ELEVEN 門市取貨"|hasMultipleMethods|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:329|input|"groupBuyPickupId"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:342|input|"storeSelectionToken"|selectedSevenElevenStore；fulfillmentMethod === "SEVEN_ELEVEN"|hidden-payload-not-clickable|
|src/app/group-buys/[slug]/order-form.tsx:343|button|重新選擇門市|selectedSevenElevenStore；fulfillmentMethod === "SEVEN_ELEVEN"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:349|button|選擇 7-ELEVEN 門市|selectedSevenElevenStore；fulfillmentMethod === "SEVEN_ELEVEN"|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:361|input|"訂購人姓名"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:365|input|"手機號碼"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:395|button|{pending ? "送出中…" : "送出訂單"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/order-form.tsx:405|button|{pending ? "送出中…" : "送出訂單"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/page.tsx:72|Link|使用 {selectedStore.name} 返回跨團結帳|selectedStore && selectionToken|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/page.tsx:79|Link|← 返回團購列表|!result.ok|source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/sku-picker.tsx:16|select|{offers.map((o) => <option key={o.id} value={o.id}>{o.label}／NT${o.salePrice}{o.status ? `／${o.status}` : ""}</option>)}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/sku-picker.tsx:18|input|數量 <input className={`m-2 w-24 ${fieldStyles}`} type="number" min={1} max={offer?.purchaseLimit ?? 9999} value={quantity} onChange={(e) => { setQuantity(Number(e.target.value)); setMessage(""); setFailed(false); }} />||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/sku-picker.tsx:19|button|{pending ? "驗證中…" : "加入購物車"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/group-buys/[slug]/sku-picker.tsx:33|Link|查看購物車||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:45|Link|返回團購列表||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:48|form|"搜尋我的訂單"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:48|input|"搜尋 QB 訂單編號"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:48|button|搜尋||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:48|Link|上一頁|page>1|source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:48|Link|下一頁|checkouts.length===20|source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:49|Link|清除搜尋條件|q && !checkouts.length|source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:54|Link|查看本次購買||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:55|Link|取消申請、退款與配送進度||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:57|summary|商品、團別及出貨群組||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:64|Link|查看團購|orders.length === 0 && checkouts.length === 0 && !q|source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/page.tsx:70|Link|<div className="flex flex-wrap items-start justify-between gap-4"> <div> <p className="text-sm text-stone-500">訂單編號</p> <p className="mt-1 font-mono text-lg font-bold tracking-wide">{order.orderNumber}</p> <h2 className={`mt-3 ${titleStyles||source-inventoried-see-cases-and-runtime-evidence|
|src/app/my/orders/[checkoutId]/page.tsx:15|Link|<span aria-hidden="true">←</span> 返回我的訂單||source-inventoried-see-cases-and-runtime-evidence|
|src/app/not-found.tsx:4|Link|返回商城||source-inventoried-see-cases-and-runtime-evidence|
|src/app/not-found.tsx:4|Link|我的訂單||source-inventoried-see-cases-and-runtime-evidence|
|src/app/orders/[publicCode]/access-form.tsx:29|form|<input type="hidden" name="publicCode" value={publicCode} /> <div className="space-y-2"> <label htmlFor="managementCode" className="block font-medium">訂單管理碼</label> <input id="managementCode" name="managementCode" required autoComplete="off||source-inventoried-see-cases-and-runtime-evidence|
|src/app/orders/[publicCode]/access-form.tsx:30|input|"publicCode"||hidden-payload-not-clickable|
|src/app/orders/[publicCode]/access-form.tsx:33|input|"managementCode"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/orders/[publicCode]/access-form.tsx:46|button|{pending ? "驗證中…" : "查看訂單"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/orders/[publicCode]/cancel-form.tsx:39|form|<input type="hidden" name="publicCode" value={publicCode} /> <fieldset disabled={pending} className="space-y-4 disabled:opacity-60"> <p className="font-medium text-red-800">取消後無法復原。</p> {state.status === "error" && ( <p role="alert" classNa||source-inventoried-see-cases-and-runtime-evidence|
|src/app/orders/[publicCode]/cancel-form.tsx:45|input|"publicCode"||hidden-payload-not-clickable|
|src/app/orders/[publicCode]/cancel-form.tsx:51|button|{pending ? "取消處理中…" : "取消訂單"}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/orders/[publicCode]/page.tsx:41|Link|<span aria-hidden="true">←</span> 返回團購列表||source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:15|Link|查看團購||source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:33|form|<input type="hidden" name="category" value={query.category ?? ""}/> <input type="hidden" name="view" value={query.view ?? ""}/> <label className="min-w-0 flex-1">搜尋商品<input className={fieldStyles} name="q" maxLength={120} defaultValue={quer||source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:33|input|"category"||hidden-payload-not-clickable|
|src/app/page.tsx:33|input|"view"||hidden-payload-not-clickable|
|src/app/page.tsx:33|input|"q"||source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:33|button|搜尋||source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:34|Link|{label}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:36|Link|全部分類|store|source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:36|Link|{c.name}||source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:37|Link|更多精選 →|store.extraFeatured；!query.q && !query.category && !query.view && store.featured.length > 0；store|source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:38|Link|清除篩選條件|query.q \|\| query.category \|\| query.view；store.cards.length；store|source-inventoried-see-cases-and-runtime-evidence|
|src/app/page.tsx:39|Link|重新載入商城|store|source-inventoried-see-cases-and-runtime-evidence|
|src/components/admin/admin-nav.tsx:33|button|{open ? "收合管理選單" : "開啟管理選單"}||source-inventoried-see-cases-and-runtime-evidence|
|src/components/admin/admin-nav.tsx:39|Link|{link.label}||source-inventoried-see-cases-and-runtime-evidence|
|src/components/admin/operations-health.tsx:41|Link|前往處理||source-inventoried-see-cases-and-runtime-evidence|
|src/components/admin/operations-health.tsx:41|Link|退款異常|key === "refunds"|source-inventoried-see-cases-and-runtime-evidence|
|src/components/admin/operations-health.tsx:44|summary|詳細技術診斷（Worker 與全部 11 項監控指標）||source-inventoried-see-cases-and-runtime-evidence|
|src/components/admin/operations-health.tsx:49|Link|付款與帳務人工查核||source-inventoried-see-cases-and-runtime-evidence|
|src/components/admin/operations-health.tsx:49|Link|取消退款與履約佇列||source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/form.tsx:15|form|{label}||source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/form.tsx:37|input|{f.name}|f.type === "checkbox"|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/form.tsx:37|select|{f.label}|f.options；f.type === "checkbox"|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/form.tsx:37|input|{f.name}|f.options；f.type === "checkbox"|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/form.tsx:38|button|{busy ? "處理中…" : label}||source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:18|summary|{o.orderNumber} · {pending?"取消審核中":label(o.status)}||source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:22|QbuyForm|"提出取消申請"|!admin&&canCancel|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:24|QbuyForm|"撤回待審申請"|!admin&&r.status==="PENDING"|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:25|QbuyForm|"核准取消"|admin&&["PENDING","REVIEW_REQUIRED"].includes(r.status)|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:25|QbuyForm|"拒絕取消"|admin&&["PENDING","REVIEW_REQUIRED"].includes(r.status)|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:31|QbuyForm|"記錄退款處理結果"|admin&&r.status!=="REFUNDED"|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:41|QbuyForm|"核實並建立物流"|admin&&shipmentReady&&!shipments.some(s=>!["VOIDED","RETURNED"].includes(s.status))&&!shipments.some(s=>s.status==="RETURNED")|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:44|QbuyForm|"記錄核實物流事件"|admin&&!["COMPLETED","RETURNED","VOIDED"].includes(s.status)|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:45|QbuyForm|"確認 QBUY 實際收到退回包裹"|admin&&s.status==="RETURNED"&&!c.returns.some(r=>r.shipmentId===s.id)|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:52|QbuyForm|"記錄數量品檢與重寄報價"|admin&&["RECEIVED","QUALITY_HOLD"].includes(r.status)|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:53|QbuyForm|"確認重寄運費實際入帳"|admin&&r.status==="AWAITING_FEE"|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/lifecycle.tsx:54|QbuyForm|"建立新重寄物流"|admin&&r.status==="READY_TO_RESEND"|source-inventoried-see-cases-and-runtime-evidence|
|src/components/qbuy/support.tsx:6|a|聯絡 QBUY LINE 官方客服 <span aria-hidden="true">↗</span>|contact && /^https:\/\/(line\.me\|lin\.ee)\//.test(contact)|source-inventoried-see-cases-and-runtime-evidence|
