import type { AdminOrderListInput } from "@/lib/orders/admin-list-query";

/** Serialize only the public list contract, never arbitrary query parameters. */
export function buildAdminOrderListUrl(input: AdminOrderListInput = {}): string {
  const params = new URLSearchParams();
  if (input.orderNumber) params.set("orderNumber", input.orderNumber);
  if (input.status) params.set("status", input.status);
  if (input.fulfillment) params.set("fulfillment", input.fulfillment);
  if (input.queue) params.set("queue", input.queue);
  if (input.navigation) {
    params.set(input.navigation.direction === "OLDER" ? "after" : "before", input.navigation.anchorPublicCode);
  }
  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}
