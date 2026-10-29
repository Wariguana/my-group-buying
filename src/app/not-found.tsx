import Link from "next/link";
import { titleStyles, buttonStyles } from "@/components/ui/primitives";
export default function NotFound() {
  return <main className="mx-auto w-full max-w-xl space-y-5 px-5 py-14"><p className="font-bold text-brand">QBUY 快易購</p><h1 className={titleStyles.page}>找不到這個頁面</h1><p>連結可能已失效，或目前帳號無法查看此紀錄。請從商城或我的訂單重新開啟。</p><div className="flex flex-wrap gap-3"><Link href="/" className={buttonStyles.primary}>返回商城</Link><Link href="/my/orders" className={buttonStyles.secondary}>我的訂單</Link></div></main>;
}
