export const adminIcons = {
  overview: "m3 11 9-8 9 8M5 10v11h5v-6h4v6h5V10",
  orders: "M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h4",
  products: "m12 3 9 5v8l-9 5-9-5V8zm0 10 9-5m-9 5L3 8m9 5v8",
  more: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z",
  payment: "M3 5h18v14H3zM3 9h18M7 15h3",
  group: "M4 4h16v16H4zM4 9h16M9 4v16",
  inventory: "M4 5h16v5H4zm2 5v10h12V10m-9 4h6",
  supplier: "M3 21V7l9-4 9 4v14M7 21v-5h10v5M7 9h2m6 0h2M7 12h2m6 0h2",
  location: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  settings: "M3 5h18M3 12h18M3 19h18M8 3v4m8 3v4M8 17v4",
  notification: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6",
  history: "M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2",
  health: "M3 12h4l3-8 4 16 3-8h4",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  arrow: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
} as const;

export type AdminIconName = keyof typeof adminIcons;
export type AdminDestination = { id: string; href: string; label: string; description: string; icon: AdminIconName; primary?: boolean };

// One route catalogue for the sidebar, More page, header and selected states.
export const adminNavigation: { title: string; links: AdminDestination[] }[] = [
  { title: "工作台", links: [
    { id: "overview", href: "/admin", label: "工作總覽", description: "今日營運與待處理事項", icon: "overview", primary: true },
  ] },
  { title: "訂單與交易", links: [
    { id: "purchases", href: "/admin/qbuy", label: "訂單管理", description: "查詢購買紀錄與處理交易", icon: "orders", primary: true },
    { id: "orders", href: "/admin/qbuy?view=orders", label: "正式 QB 訂單", description: "查看已成立的正式訂單", icon: "orders" },
    { id: "payments", href: "/admin/payments", label: "付款確認", description: "核對顧客轉帳與銀行入帳", icon: "payment" },
    { id: "legacy", href: "/admin/orders", label: "舊制訂單", description: "查詢與處理既有歷史訂單", icon: "history" },
  ] },
  { title: "商品與團購", links: [
    { id: "products", href: "/admin/products", label: "商品管理", description: "維護商品資料", icon: "products", primary: true },
    { id: "group-buys", href: "/admin/group-buys", label: "團購管理", description: "建立團購與管理開團內容", icon: "group" },
    { id: "commerce", href: "/admin/commerce", label: "商品規格與庫存", description: "管理規格、庫存與異動紀錄", icon: "inventory" },
    { id: "suppliers", href: "/admin/suppliers", label: "供應商管理", description: "維護供應商與聯絡資料", icon: "supplier" },
  ] },
  { title: "營運設定", links: [
    { id: "pickup-locations", href: "/admin/pickup-locations", label: "取貨地點", description: "管理可選用的取貨地點", icon: "location" },
    { id: "settings", href: "/admin/payments?settings=1#settings", label: "銀行與配送設定", description: "維護收款帳戶與配送選項", icon: "settings" },
  ] },
  { title: "系統管理", links: [
    { id: "notifications", href: "/admin/qbuy/notifications", label: "通知對象", description: "管理已核實的 LINE 通知對象", icon: "notification" },
    { id: "operations", href: "/admin/operations", label: "系統狀態", description: "查看營運監控與服務健康狀態", icon: "health" },
  ] },
];

export const mobileNavigation = [
  { id: "overview", href: "/admin", label: "總覽", icon: "overview" },
  { id: "orders", href: "/admin/qbuy", label: "訂單", icon: "orders" },
  { id: "products", href: "/admin/products", label: "商品", icon: "products" },
  { id: "more", href: "/admin/more", label: "更多", icon: "more" },
] as const;

export function getAdminDestination(pathname: string, query: Pick<URLSearchParams, "getAll">, hash = "") {
  const single = (name: string) => { const values = query.getAll(name); return values.length === 1 ? values[0] : undefined; };
  if (pathname === "/admin/qbuy/notifications") return "notifications";
  if (pathname === "/admin/qbuy") return single("view") === "orders" ? "orders" : "purchases";
  if (pathname.startsWith("/admin/qbuy/")) return "purchases";
  if (pathname === "/admin/payments") return single("settings") === "1" || hash === "#settings" ? "settings" : "payments";
  if (pathname.startsWith("/admin/inventory/")) return "commerce";
  return adminNavigation.flatMap(group => group.links).find(link => {
    const base = link.href.split("?")[0];
    return pathname === base || (base !== "/admin" && pathname.startsWith(base + "/"));
  })?.id ?? "more";
}

export function getMobileDestination(destination: string) {
  if (destination === "overview" || destination === "products") return destination;
  if (destination === "purchases" || destination === "orders") return "orders";
  return "more";
}
