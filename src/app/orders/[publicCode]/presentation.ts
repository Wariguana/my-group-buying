export type SelfPickupStatus = "尚未開始" | "取貨期間中" | "已逾取貨期間" | "待取貨" | "已取貨";

export function deriveSelfPickupStatus({
  pickedUpAt,
  pickupStartAt,
  pickupEndAt,
  now,
}: Readonly<{
  pickedUpAt: Date | null;
  pickupStartAt: Date | null;
  pickupEndAt: Date | null;
  now: Date;
}>): SelfPickupStatus {
  if (pickedUpAt) return "已取貨";
  if (pickupStartAt && now < pickupStartAt) return "尚未開始";
  if (pickupStartAt && now >= pickupStartAt && (!pickupEndAt || now <= pickupEndAt)) return "取貨期間中";
  if (pickupEndAt && now > pickupEndAt) return "已逾取貨期間";
  return "待取貨";
}

export function selfPickupStatusTone(status: SelfPickupStatus): "blue" | "green" | "amber" | "slate" | "red" {
  if (status === "已取貨") return "green";
  if (status === "取貨期間中") return "blue";
  if (status === "已逾取貨期間") return "red";
  if (status === "尚未開始") return "slate";
  return "amber";
}
