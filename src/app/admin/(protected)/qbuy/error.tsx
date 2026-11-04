"use client";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/primitives";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-4 rounded-xl border border-stone-200 bg-white p-6"><h1 className="text-xl font-bold">訂單資料暫時無法讀取</h1><p className="text-sm leading-6 text-stone-600">請重新載入確認目前狀態。讀取失敗不代表沒有訂單；剛送出的交易操作可能已完成，請先查核再重試。</p><div className="flex flex-wrap gap-3"><button type="button" onClick={reset} className={buttonStyles.primary}>重新載入</button><Link href="/admin" className={buttonStyles.secondary}>返回工作總覽</Link></div></section>;
}
