import type { ReactNode } from "react";
import { CustomerPageShell } from "@/app/group-buys/public-ui";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";

export default async function HelpLayout({ children }: { children: ReactNode }) {
  return <CustomerPageShell customerAccount={await getCurrentCustomerAccount()}>{children}</CustomerPageShell>;
}
