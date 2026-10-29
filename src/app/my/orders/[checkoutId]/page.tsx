import { buttonStyles, titleStyles } from "@/components/ui/primitives";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { customerLifecycle } from "@/lib/qbuy/queries";
import { LifecyclePanel } from "@/components/qbuy/lifecycle";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { CustomerSupport } from "@/components/qbuy/support";
import { z } from "zod";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{checkoutId:string}>}) {
 const owner=await getCurrentCustomerAccount();if(!owner)redirect("/");
 const {checkoutId}=await params;if(!z.uuid().safeParse(checkoutId).success)notFound();
 const c=await customerLifecycle(checkoutId,owner.id);if(!c)notFound();
 return <CustomerPageShell customerAccount={owner} width="max-w-4xl"><div className="space-y-5"><Link className={buttonStyles.secondary} href="/my/orders"><span aria-hidden="true">←</span>返回我的訂單</Link><h1 className={titleStyles.page}>本次購買：取消、退款與配送</h1><CustomerSupport/><LifecyclePanel c={c}/></div></CustomerPageShell>;
}
