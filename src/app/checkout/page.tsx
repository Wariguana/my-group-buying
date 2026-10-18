import { redirect } from "next/navigation";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { getDb } from "@/lib/db";
import { CheckoutForm } from "./form";
export const dynamic = "force-dynamic";
export default async function CheckoutPage() {
    const account = await getCurrentCustomerAccount();
    if (!account)
        redirect("/api/auth/line/start");
    const rates = await getDb().shippingRate.findMany({ where: { enabled: true, method: { in: ["HOME_DELIVERY", "SEVEN_ELEVEN"] } }, select: { method: true } });
    return <CustomerPageShell customerAccount={account}><h1 className="mb-6 text-3xl font-bold">跨團結帳</h1><CheckoutForm methods={[...new Set(rates.map(r => r.method))]}/></CustomerPageShell>;
}
