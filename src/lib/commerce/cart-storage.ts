import { cartSchema, type CartLine } from "./validation";

export const CART_KEY = "qbuy.cart.v1";
export function loadCart(storage: Pick<Storage, "getItem">): CartLine[] {
  const raw = storage.getItem(CART_KEY);
  if (!raw) return [];
  if (raw.length > 32_000) throw new Error("購物車資料過大，請清除後重試。");
  let decoded: unknown;
  try { decoded = JSON.parse(raw); }
  catch { throw new Error("購物車資料損毀，請清除後重新選購。"); }
  const parsed = cartSchema.safeParse(decoded);
  if (!parsed.success) throw new Error("購物車資料無效，請清除後重試。");
  return parsed.data;
}
export function saveCart(storage: Pick<Storage, "setItem">, lines: CartLine[]) {
  storage.setItem(CART_KEY, JSON.stringify(cartSchema.parse(lines)));
}

export function removeAcknowledgedCartLines(storage: Pick<Storage, "getItem" | "setItem">, purchased: CartLine[]) {
  const current = loadCart(storage);
  // A different tab may have added items or changed quantities during Checkout.
  saveCart(storage, current.filter(line => !purchased.some(p => p.offerId === line.offerId && p.quantity === line.quantity && p.expectedPrice === line.expectedPrice)));
}
