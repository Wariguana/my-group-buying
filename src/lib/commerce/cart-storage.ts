import { cartSchema, type CartLine } from "./validation";

export const CART_KEY = "qbuy.cart.v1";
export function loadCart(storage: Pick<Storage, "getItem">): CartLine[] {
  const raw = storage.getItem(CART_KEY);
  if (!raw) return [];
  if (raw.length > 32_000) throw new Error("購物車資料過大，請清除後重試。");
  const parsed = cartSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("購物車資料無效，請清除後重試。");
  return parsed.data;
}
export function saveCart(storage: Pick<Storage, "setItem">, lines: CartLine[]) {
  storage.setItem(CART_KEY, JSON.stringify(cartSchema.parse(lines)));
}
