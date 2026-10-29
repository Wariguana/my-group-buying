import { linkStyles } from "@/components/ui/primitives";
import "server-only";
export function CustomerSupport() {
  const contact = process.env.QBUY_LINE_OFFICIAL_URL;
  return <aside aria-label="聯絡客服" className="rounded-xl border border-stone-200 bg-white p-4 text-sm">{contact && /^https:\/\/(line\.me|lin\.ee)\//.test(contact)
    ? <a href={contact} className={linkStyles.inline}>聯絡 QBUY LINE 官方客服</a>
    : <p>客服連結尚待營運設定。若已付款，請保留轉帳紀錄，勿再次付款。</p>}</aside>;
}
