# QBUY 隔離驗收截圖

以下 9 張為初次品質驗收的歷史截圖，保留原始 SHA256，並非目前按鈕樣式。最新「返回我的訂單」及導頁連結按鈕化畫面請看 [新版截圖](url-buttons/README.md)。

2026-10-29；來源為 Playwright production-mode E2E。全為合成商品、姓名、電話、銀行、物流與 session；不是正式外部驗收。

- [admin-390.png](admin-390.png)
- [admin-bank-reconciliation.png](admin-bank-reconciliation.png)
- [admin-return-resend-history.png](admin-return-resend-history.png)
- [customer-refund-delivery.png](customer-refund-delivery.png)
- [my-purchase-three-qb-orders.png](my-purchase-three-qb-orders.png)
- [payment-390.png](payment-390.png)
- [quote-1440.png](quote-1440.png)
- [quote-390.png](quote-390.png)
- [quote-768.png](quote-768.png)

[驗證摘要與 SHA256](verification-summary.json)。原始案例為 `e2e/qbuy-experience.spec.ts`、`e2e/qbuy-milestone-2.spec.ts`、`e2e/qbuy-milestone-3.spec.ts`；執行 `npm run test:e2e` 會在 test-results 重新產生，時間／UUID／編號不同。

沒有製作或捏造修改前截圖；修改前後行為比較請見基準 commit 差異與品質驗收文件。
