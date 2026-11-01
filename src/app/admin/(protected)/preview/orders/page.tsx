import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { FormalOrderCard, PurchaseCard } from "@/components/admin/transaction-cards";
import { PageHeader, buttonStyles } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const purchaseScenarios = [
  { status: "AWAITING_PAYMENT", label: "等待顧客付款", note: "尚未回報轉帳；不應算成管理員待核帳" },
  { status: "REPORTED", label: "顧客已回報轉帳", note: "請先確認銀行實際入帳，再決定是否核帳" },
  { status: "ANOMALY", label: "付款金額或資料異常", note: "應收、實收或參考號需要人工查核" },
  { status: "RECEIVED", label: "已確認收款", note: "尚未完成正式 QB 訂單建立" },
  { status: "FINALIZED", label: "正式訂單已建立", note: "可以查看相關 QB 訂單與配送群組" },
  { status: "EXPIRED", label: "付款期限已過", note: "逾期購買可能需要例外處置" },
  { status: "REFUND_REQUIRED", label: "等待處理退款", note: "建立退款義務不等於款項已退還" },
] as const;

const names = ["林小姐", "陳先生", "張小姐", "王先生", "吳小姐", "李先生", "黃小姐", "劉先生"];
const prices = [1280, 860, 2590, 399, 1760, 4200, 550];
const ways = ["7-ELEVEN 常溫", "宅配冷凍", "全家常溫", "宅配冷藏", "7-ELEVEN 常溫", "宅配常溫"];
const longProduct = "【測試超長名稱】產地嚴選綜合水果禮盒・家庭分享組・多規格搭配供應商限定季節性預購商品";
const purchases = Array.from({ length: 28 }, (_, index) => {
  const scenario = purchaseScenarios[index % purchaseScenarios.length];
  return {
    id: `DEMO-CHECKOUT-${String(index + 1).padStart(3, "0")}`,
    customerName: names[index % names.length],
    customerPhone: `09**-***-${String(index + 101).padStart(3, "0")}`,
    status: scenario.status, label: scenario.label, note: scenario.note,
    createdAt: new Date(Date.UTC(2026, 9, 31 - (index % 6), 3 + (index % 9), 20)),
    totalAmount: prices[index % prices.length],
    orderCount: scenario.status === "FINALIZED" ? (index % 3) + 1 : 0,
    groupCount: index % 4 === 0 ? 2 : 1,
    method: ways[index % ways.length],
    product: index % 5 === 0 ? longProduct : ["綜合水果禮盒", "手作冷凍水餃", "經典原味堅果", "季節蔬菜箱"][index % 4],
  };
});
const orders = Array.from({ length: 16 }, (_, index) => ({
  id: `DEMO-QB-${String(index + 1).padStart(3, "0")}`,
  orderNumber: `QB-DEMO-${String(index + 1).padStart(5, "0")}`,
  groupTitle: index % 4 === 0 ? longProduct : ["冬季食材團購", "本週嚴選水果", "冷凍食品預購", "常溫零食分享團"][index % 4],
  customerName: names[index % names.length],
  status: index % 5 === 0 ? "CANCELLED" : "PAID",
  totalAmount: prices[index % prices.length],
  createdAt: new Date(Date.UTC(2026, 9, 31 - (index % 6), 6, 30)),
}));

export default async function OrderPreview({ searchParams }: {
  searchParams: Promise<{ view?: string; status?: string }>;
}) {
  // Never expose fabricated financial or fulfillment records as a production admin page.
  if (process.env.NODE_ENV === "production") notFound();
  await requireAdmin();
  const params = await searchParams;
  const view = params.view === "orders" ? "orders" : "purchases";
  const activeStatus = purchaseScenarios.some((scenario) => scenario.status === params.status) ? params.status : undefined;
  const visible = activeStatus ? purchases.filter((item) => item.status === activeStatus) : purchases;

  return (
    <section className="space-y-5">
      <PageHeader eyebrow="DEVELOPMENT ONLY" title="測試訂單畫面" description="使用與正式後台相同的訂單卡片元件，檢查不同付款、訂單、配送狀態及長文字的手機／電腦版面。" />
      <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-bold">以下所有顧客、編號、金額與狀態都是模擬資料。</p>
        <p>本頁不讀取或寫入交易資料庫，不能測試真正的核帳、取消、退款或物流狀態轉移，也不會執行任何交易操作。</p>
      </div>
      <nav aria-label="測試資料類型" className="flex flex-wrap gap-2">
        <Link aria-current={view === "purchases" ? "page" : undefined} className={view === "purchases" ? buttonStyles.primary : buttonStyles.secondary} href="/admin/preview/orders?view=purchases">購買紀錄（28 筆）</Link>
        <Link aria-current={view === "orders" ? "page" : undefined} className={view === "orders" ? buttonStyles.primary : buttonStyles.secondary} href="/admin/preview/orders?view=orders">正式訂單（16 筆）</Link>
        <Link className={buttonStyles.secondary} href="/admin/qbuy">返回真正的訂單管理</Link>
      </nav>
      {view === "purchases" ? (
        <>
          <nav aria-label="測試付款情境" className="flex flex-wrap gap-2">
            <Link className={!activeStatus ? buttonStyles.primary : buttonStyles.secondary} href="?view=purchases">全部情境</Link>
            {purchaseScenarios.map((scenario) => (
              <Link key={scenario.status} href={`?view=purchases&status=${scenario.status}`}
                className={activeStatus === scenario.status ? buttonStyles.primary : buttonStyles.secondary}>{scenario.label}</Link>
            ))}
          </nav>
          <p className="text-sm text-slate-600">顯示 {visible.length} 筆模擬購買紀錄</p>
          <div className="grid gap-3">
            {visible.map((item) => (
              <PurchaseCard key={item.id} data={{
                customerName: item.customerName, customerPhone: item.customerPhone, status: item.status,
                createdAt: item.createdAt, totalAmount: item.totalAmount,
                orderCount: item.orderCount, groupCount: item.groupCount,
              }}>
                <p className="text-xs font-semibold text-slate-500">測試情境：{item.label} · {item.id}</p>
                <p className="break-words font-medium">{item.product}</p>
                <p className="text-sm text-slate-700">配送方式：{item.method}</p>
                <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">這個情境應讓管理員知道：{item.note}</p>
                <p className="text-xs text-slate-500">模擬資料不可提交付款、物流或退款操作。</p>
              </PurchaseCard>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">顯示 {orders.length} 筆模擬正式訂單；包含超長團購名稱及已取消狀態。</p>
          <div className="grid gap-3">
            {orders.map((item) => (
              <FormalOrderCard key={item.id} data={item}>
                <span className="text-xs text-slate-500">模擬資料，沒有真正的交易詳情</span>
              </FormalOrderCard>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
