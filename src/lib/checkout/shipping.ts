import type { ShippingRate } from "@/generated/prisma/client";
export type ShippingLine = {
    offerId: string;
    groupBuyId: string;
    canCombine: boolean;
    endAt: Date;
    quantity: number;
    price: number;
    temperature: string;
    methods: string[];
    weightGrams: number | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    note: string | null;
};
export function safeAmount(value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000)
        throw new Error("金額超出支援範圍。");
    return value;
}
export function shippingQuote(lines: ShippingLine[], method: string, rates: ShippingRate[]) {
    const groups = new Map<string, {
        key: string;
        rate: ShippingRate;
        lines: ShippingLine[];
        subtotal: number;
        weight: number;
        volume: number;
        packedHeight: number;
        waitUntil: Date;
        shippingAmount: number;
    }>();
    for (const line of lines) {
        const rate = rates.find(r => r.enabled && r.method === method && r.temperature === line.temperature);
        // Unstructured restrictions require manual resolution before enabling Checkout.
        if (!rate || !line.methods.includes(method) || line.note?.trim() || !line.weightGrams || !line.lengthMm || !line.widthMm || !line.heightMm)
            throw new Error("商品物流能力、尺寸或限制尚未確認。");
        const dimensions = [line.lengthMm, line.widthMm, line.heightMm].sort((a, b) => b - a);
        const limits = [rate.maxLengthMm, rate.maxWidthMm, rate.maxHeightMm].sort((a, b) => b - a);
        if (dimensions.some((d, i) => d > limits[i]))
            throw new Error("商品尺寸不適用此配送方式。");
        const key = `${rate.id}:${line.canCombine ? "combined" : line.groupBuyId}`;
        const group = groups.get(key) ?? { key, rate, lines: [], subtotal: 0, weight: 0, volume: 0, packedHeight: 0, waitUntil: line.endAt, shippingAmount: 0 };
        group.lines.push(line);
        group.subtotal = safeAmount(group.subtotal + line.price * line.quantity);
        group.weight += line.weightGrams * line.quantity;
        group.packedHeight += dimensions[2] * line.quantity;
        group.volume += line.lengthMm * line.widthMm * line.heightMm * line.quantity;
        if (group.packedHeight > limits[2] || group.weight > rate.maxWeightGrams || group.volume > rate.maxLengthMm * rate.maxWidthMm * rate.maxHeightMm)
            throw new Error("同組重量或材積超出已確認物流能力，請分次購買。");
        if (line.endAt > group.waitUntil)
            group.waitUntil = line.endAt;
        group.shippingAmount = rate.freeThreshold !== null && group.subtotal >= rate.freeThreshold ? 0 : rate.fee;
        groups.set(key, group);
    }
    const result = [...groups.values()];
    const subtotal = safeAmount(result.reduce((sum, g) => sum + g.subtotal, 0));
    const shippingAmount = safeAmount(result.reduce((sum, g) => sum + g.shippingAmount, 0));
    return { groups: result, subtotal, shippingAmount, totalAmount: safeAmount(subtotal + shippingAmount) };
}
