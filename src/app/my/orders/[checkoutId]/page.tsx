import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { customerLifecycle } from "@/lib/qbuy/queries";
import { LifecyclePanel } from "@/components/qbuy/lifecycle";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{checkoutId:string}>}) {
 const owner=await getCurrentCustomerAccount();if(!owner)redirect("/");
 const {checkoutId}=await params;if(!/^[0-9a-f-]{36}$/i.test(checkoutId))notFound();
 const c=await customerLifecycle(checkoutId,owner.id);if(!c)notFound();
 const contact=process.env.QBUY_LINE_OFFICIAL_URL;
 return <main className="mx-auto max-w-4xl space-y-5 p-5"><Link href="/my/orders">返回我的訂單</Link><h1 className="text-2xl font-bold">本次購買：取消、退款與配送</h1>{contact&&/^https:\/\/(line\.me|lin\.ee)\//.test(contact)?<a href={contact} className="underline">聯絡 QBUY LINE 官方客服</a>:<p>請透過 QBUY LINE 官方帳號聯絡客服；客服連結尚待營運設定。</p>}<LifecyclePanel c={c}/></main>;
}
