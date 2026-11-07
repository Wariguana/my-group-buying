import type { ShippingRate } from "@/generated/prisma/client";

type Capacity = { weight: number; packedHeight: number; volume: number };
type PackageLine = {
  methods: string[];
  quantity: number;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  note?: string | null;
};

// Use the same conservative rotated, stacked packing rule at quote and fulfillment.
export function addShippingPackageLine(current: Capacity, line: PackageLine, method: string, rate: ShippingRate): Capacity {
  const { weightGrams, lengthMm, widthMm, heightMm } = line;
  if (!line.methods.includes(method) || line.note?.trim()
    || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
    || !weightGrams || !lengthMm || !widthMm || !heightMm
    || [weightGrams, lengthMm, widthMm, heightMm].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error("商品物流能力、尺寸或重量尚未確認。");
  }
  const dimensions = [lengthMm, widthMm, heightMm].sort((a, b) => b - a);
  const limits = [rate.maxLengthMm, rate.maxWidthMm, rate.maxHeightMm].sort((a, b) => b - a);
  if (dimensions.some((dimension, i) => dimension > limits[i])) throw new Error("商品尺寸不適用此配送方式。");
  const next = {
    weight: current.weight + weightGrams * line.quantity,
    packedHeight: current.packedHeight + dimensions[2] * line.quantity,
    volume: current.volume + lengthMm * widthMm * heightMm * line.quantity,
  };
  if (next.packedHeight > limits[2] || next.weight > rate.maxWeightGrams || next.volume > limits[0] * limits[1] * limits[2]) {
    throw new Error("同組重量或體積超出已確認物流能力，請分批購買。");
  }
  return next;
}
