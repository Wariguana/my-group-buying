# UI Guidelines

2026-11-01 消費者端定稿：Responsive／Sticky Header、分類微互動、商品卡與缺圖、購物流程、Footer／Accordion 及協助頁採用已驗收版本。消費者 UI 位於 `src/components/consumer`，暖白基礎規則限定 `.qbuy-customer-page`；ADM 與原共用元件維持 main 規格。條款／隱私未核定，Production 僅提供未發布狀態。依賴隔離、品質檢查及限制見 [定稿驗收](consumer-ui-finalization/README.md)。

- The customer frontend is mobile-first.
- Admin UI prioritizes operational efficiency over decorative dashboard UI.
- Reuse components instead of duplicating patterns.
- Provide accessible labels and interactions.
- Provide clear loading, error, and empty states.
- Destructive operations require confirmation.
- Do not define a full visual design system yet.
