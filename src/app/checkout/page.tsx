import { redirect } from "next/navigation";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { getDb } from "@/lib/db";
import { CheckoutForm } from "./form";
import { featureEnabled } from "@/lib/operations/config";
export const dynamic = "force-dynamic";
export default async function CheckoutPage() {
    const account = await getCurrentCustomerAccount();
    if (!account)
        redirect("/api/auth/line/start");
    const rates = await getDb().shippingRate.findMany({ where: { enabled: true, method: { in: ["HOME_DELIVERY", "SEVEN_ELEVEN", "FAMILY_MART"] } }, select: { method: true } });
    const stores = await getDb().verifiedPickupStore.findMany({ where: { isActive: true }, select: { id: true, name: true, address: true }, orderBy: { name: "asc" } });
    const methods = (["HOME_DELIVERY", "SEVEN_ELEVEN", "FAMILY_MART"] as const).filter(m => rates.some(r => r.method === m) && featureEnabled(m) && (m !== "FAMILY_MART" || stores.length > 0));
    return <CustomerPageShell customerAccount={account}><h1 className="mb-6 text-3xl font-bold">跨團結帳</h1><CheckoutForm methods={methods} stores={stores}/></CustomerPageShell>;
}
