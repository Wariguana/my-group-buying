import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { CartClient } from "./cart-client";
export const dynamic = "force-dynamic";
export default async function CartPage() {
  return <CustomerPageShell customerAccount={await getCurrentCustomerAccount()}><CartClient /></CustomerPageShell>;
}
