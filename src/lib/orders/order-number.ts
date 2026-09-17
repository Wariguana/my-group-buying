export const ORDER_NUMBER_PATTERN = /^\d{12}$/;
export const MAX_DAILY_ORDER_NUMBER = 9_999;

const taipeiDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatTaipeiOrderDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid order date.");
  const parts = Object.fromEntries(
    taipeiDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

export function formatOrderNumber(dateKey: string, sequence: number): string {
  if (!/^\d{8}$/.test(dateKey)) throw new RangeError("Invalid order date key.");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_DAILY_ORDER_NUMBER) {
    throw new RangeError("Order number sequence is outside the supported daily range.");
  }
  const orderNumber = `${dateKey}${sequence.toString().padStart(4, "0")}`;
  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) throw new RangeError("Invalid order number.");
  return orderNumber;
}
