"use client";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/primitives";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main className="mx-auto w-full max-w-xl space-y-5 px-5 py-14"><p className="font-bold text-brand">QBUY 快易購</p><h1 className="text-2xl font-bold">暫時無法載入這個頁面</h1><p role="alert">請稍後重新載入。若剛提交付款、訂單或退款操作，請先查看目前紀錄，確認結果後再重試，避免重複付款。</p><div className="flex flex-wrap gap-3"><button className={buttonStyles.primary} onClick={retry}>重新載入</button><Link href="/my/orders" className={buttonStyles.secondary}>查看我的訂單</Link><Link href="/" className={buttonStyles.secondary}>返回商城</Link></div></main>;
}
