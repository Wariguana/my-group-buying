import Link from "next/link";
import { getDb } from "@/lib/db";
import { getTaipeiCalendarDayBounds } from "@/lib/group-buys/time";
import { requireAdmin } from "@/lib/auth/current-admin";
import { adminLifecycle, queues } from "@/lib/qbuy/queries";
import { LifecyclePanel } from "@/components/qbuy/lifecycle";
import { QbuyForm } from "@/components/qbuy/form";
import { EmptyState, PageHeader, buttonStyles, fieldStyles } from "@/components/ui/primitives";
import { FormalOrderCard, PurchaseCard } from "@/components/admin/transaction-cards";

export const dynamic = "force-dynamic";
const time = (date: Date) => date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
type Params = { view?: string; q?: string; page?: string; queue?: string; today?: string };

function ViewTabs({ view }: { view: "purchases" | "orders" }) {
  return (
    <nav aria-label="交易類型" className="flex gap-2 border-b border-slate-200 pb-3">
      {[
        { key: "purchases", label: "購買紀錄", caption: "包含尚未付款的購買" },
        { key: "orders", label: "正式訂單", caption: "已完成建單的 QB 訂單" },
      ].map((tab) => (
        <Link key={tab.key} href={`/admin/qbuy?view=${tab.key}`} aria-current={view === tab.key ? "page" : undefined}
          className={`flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-3 py-2 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:flex-none sm:px-5 ${view === tab.key ? "bg-slate-900 text-white" : "bg-white text-slate-800 hover:bg-slate-100"}`}>
          <span className="text-sm font-bold">{tab.label}</span>
          <span className={`mt-0.5 text-xs ${view === tab.key ? "text-slate-200" : "text-slate-500"}`}>{tab.caption}</span>
        </Link>
      ))}
    </nav>
  );
}

type Recipient = { id: string; customerAccountId: string | null; adminId: string | null; enabled: boolean };
function RecipientPanel({ recipients }: { recipients: Recipient[] }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold">進階設定：LINE 通知對象核實</summary>
      <p className="my-3 text-sm leading-6 text-slate-600">須核實 LINE 身分、接收同意與推播資格。登入成功不等於可以推播。</p>
      <QbuyForm operation="recipient" base={{}} confirm label="記錄已核實通知對象"
        fields={[
          { name: "customerAccountId", label: "顧客 UUID（與管理員擇一）", required: false },
          { name: "adminId", label: "管理員 UUID（與顧客擇一）", required: false },
          { name: "messagingUserId", label: "Messaging 使用者 ID" },
          { name: "providerId", label: "已核實 Provider ID" },
          { name: "evidence", label: "身分、同意與可推播資格核實依據" },
        ]} />
      {recipients.map((recipient) => (
        <div key={recipient.id} className="border-t border-slate-100 py-3 text-sm">
          <p className="break-all">對象 {recipient.customerAccountId ?? recipient.adminId} · {recipient.enabled ? "通知已啟用" : "通知已停用"}</p>
          {recipient.enabled && <QbuyForm operation="recipient-disable" base={{ id: recipient.id }} confirm label="停用此通知對象" fields={[{ name: "evidence", label: "停用或撤回同意依據" }]} />}
        </div>
      ))}
    </details>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const view = params.view === "orders" ? "orders" : "purchases";
  const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));
  const q = (params.q ?? "").trim().slice(0, 100);
  const queue = params.queue && Object.hasOwn(queues, params.queue) ? params.queue : "all";
  const today = params.today === "1";
  const { start, end } = getTaipeiCalendarDayBounds(new Date());

  if (view === "orders") {
    const where = { ...(q ? { orderNumber: { contains: q, mode: "insensitive" as const } } : {}), ...(today ? { createdAt: { gte: start, lt: end } } : {}) };
    const [rows, count] = await Promise.all([
      getDb().qbOrder.findMany({
        where, take: 20, skip: (page - 1) * 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          orderNumber: true, status: true, totalAmount: true, createdAt: true,
          checkout: { select: { customerName: true } },
          groupBuy: { select: { title: true } },
        },
      }),
      getDb().qbOrder.count({ where }),
    ]);
    const pageUrl = (next: number) => `/admin/qbuy?view=orders&page=${next}&q=${encodeURIComponent(q)}${today ? "&today=1" : ""}`;
    return (
      <section className="space-y-5">
        <PageHeader eyebrow="Orders" title="訂單管理" description="先選擇購買紀錄或正式訂單，再查詢需要處理的交易。" />
        <ViewTabs view="orders" />
        <p className="text-sm leading-6 text-slate-600">這裡只顯示已完成建單的 QB 訂單；尚未完成付款確認的購買請至「購買紀錄」查詢。</p>
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input type="hidden" name="view" value="orders" />
          {today && <input type="hidden" name="today" value="1" />}
          <label className="min-w-[14rem] flex-1 text-sm font-semibold text-slate-800">搜尋正式訂單編號
            <input className={`mt-1.5 ${fieldStyles}`} name="q" defaultValue={q} maxLength={100} autoComplete="off" placeholder="輸入 QB 訂單編號" />
          </label>
          <button className={buttonStyles.primary}>搜尋</button>
          <Link href="/admin/qbuy?view=orders" className={buttonStyles.secondary}>清除條件</Link>
        </form>
        <p className="text-sm text-slate-600">{today ? "今天成立的" : "符合條件的"}正式訂單：{count} 筆</p>
        {!rows.length ? <EmptyState title={q ? "找不到符合的正式訂單" : "目前尚無正式 QB 訂單"} description="顧客完成購買，不代表已確認收款並建立正式訂單。" /> : (
          <div className="grid gap-3">
            {rows.map((order) => (
              <FormalOrderCard key={order.orderNumber} data={{
                orderNumber: order.orderNumber, status: order.status, totalAmount: order.totalAmount,
                createdAt: order.createdAt, customerName: order.checkout.customerName, groupTitle: order.groupBuy.title,
                detailHref: `/admin/qbuy?view=purchases&queue=all&q=${encodeURIComponent(order.orderNumber)}`,
              }} />
            ))}
          </div>
        )}
        <nav aria-label="正式訂單分頁" className="flex flex-wrap gap-3">
          {page > 1 && <Link href={pageUrl(page - 1)} className={buttonStyles.secondary}>上一頁</Link>}
          {page * 20 < count && <Link href={pageUrl(page + 1)} className={buttonStyles.secondary}>下一頁</Link>}
        </nav>
      </section>
    );
  }

  const result = await adminLifecycle({ q, page: String(page), queue, today: today ? "1" : undefined });
  const recipients = await getDb().lineRecipient.findMany({ take: 50, orderBy: { verifiedAt: "desc" } });
  const pageUrl = (next: number) => `/admin/qbuy?view=purchases&queue=${encodeURIComponent(queue)}&q=${encodeURIComponent(q)}&page=${next}${today ? "&today=1" : ""}`;

  return (
    <section className="space-y-5">
      <PageHeader eyebrow="Orders" title="訂單管理" description="查詢顧客的購買紀錄、正式訂單與相關付款、取消及配送狀態。" />
      <ViewTabs view="purchases" />
      <p className="text-sm leading-6 text-slate-600">購買紀錄包含尚未確認付款的交易。只有核對銀行入帳並完成建單後，才會出現在「正式訂單」。</p>
      <nav aria-label="購買紀錄處理類型" className="flex flex-wrap gap-2">
        {Object.entries(queues).map(([key, value]) => (
          <Link key={key} href={`/admin/qbuy?view=purchases&queue=${encodeURIComponent(key)}`}
            aria-current={queue === key ? "page" : undefined}
            className={queue === key ? buttonStyles.primary : buttonStyles.secondary}>{key === "all" ? "全部購買紀錄" : value}</Link>
        ))}
      </nav>
      <form method="get" aria-label="搜尋購買紀錄" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="view" value="purchases" />
        <input type="hidden" name="queue" value={queue} />
        {today && <input type="hidden" name="today" value="1" />}
        <label className="min-w-[14rem] flex-1 text-sm font-semibold text-slate-800">搜尋正式訂單編號、姓名或電話
          <input className={`mt-1.5 ${fieldStyles}`} name="q" defaultValue={q} maxLength={100} autoComplete="off" placeholder="輸入編號或顧客資料" />
        </label>
        <button className={buttonStyles.primary}>搜尋</button>
        <Link href="/admin/qbuy?view=purchases" className={buttonStyles.secondary}>清除條件</Link>
      </form>
      <p className="text-sm text-slate-600">{today ? "今天新增" : "符合條件"}：{result.count} 筆購買紀錄；第 {result.page} 頁（每頁 20 筆）。</p>
      {!result.rows.length && <EmptyState title="目前沒有符合條件的購買紀錄" description="可調整搜尋條件，或切換其他處理類型。" />}
      <div className="grid gap-3">
        {result.rows.map((checkout) => (
          <PurchaseCard key={checkout.id} data={{
            customerName: checkout.customerName, customerPhone: checkout.customerPhone, status: checkout.status,
            createdAt: checkout.createdAt, totalAmount: checkout.totalAmount,
            orderCount: checkout.orders.length, groupCount: checkout.fulfillmentGroups.length,
          }}>

                <Link className={buttonStyles.secondary} href="/admin/payments?view=all">前往付款確認頁</Link>
                <LifecyclePanel c={checkout} admin />
                <details className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer font-semibold">通知狀態與重試（進階）</summary>
                  {checkout.outbox.map((event) => (
                    <div key={event.id} className="mt-3 text-sm">
                      <p className="break-words">{event.event} · {event.status} · 已嘗試 {event.attempts} 次 · {event.lastError ?? "無錯誤訊息"}</p>
                      {["BLOCKED", "RETRY"].includes(event.status) && <QbuyForm operation="retry" base={{ id: event.id }} fields={[]} confirm label="排入通知安全重試" />}
                    </div>
                  ))}
                </details>
                <details className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer font-semibold">操作稽核紀錄（進階）</summary>
                  {checkout.audits.map((audit) => (
                    <p key={audit.id} className="mt-2 break-all text-xs text-slate-700">{time(audit.createdAt)} · {audit.event} · 操作者 {audit.actorId ?? "顧客／系統"} · {JSON.stringify(audit.detail)}</p>
                  ))}
                </details>

          </PurchaseCard>
        ))}
      </div>
      <nav aria-label="購買紀錄分頁" className="flex flex-wrap gap-3">
        {page > 1 && <Link href={pageUrl(page - 1)} className={buttonStyles.secondary}>上一頁</Link>}
        {page * 20 < result.count && <Link href={pageUrl(page + 1)} className={buttonStyles.secondary}>下一頁</Link>}
      </nav>
      <RecipientPanel recipients={recipients} />
      {process.env.NODE_ENV !== "production" && <Link href="/admin/preview/orders" className={buttonStyles.secondary}>預覽測試訂單畫面</Link>}
    </section>
  );
}
