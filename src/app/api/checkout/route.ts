import { NextRequest, NextResponse } from "next/server";
import { getSameRequestOrigin } from "@/lib/http/request-origin";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getDb } from "@/lib/db";
import { createCheckout, recordReceipt, finalizeCheckout, flagAnomaly, resolveException, expireCheckouts, CheckoutError } from "@/lib/checkout/service";
import { bankInput, rateInput, pickupStoreInput } from "@/lib/checkout/validation";
import { ZodError, z } from "zod";
import { cookies } from "next/headers";
import { STORE_SELECTION_BINDING_COOKIE } from "@/lib/logistics/store-selection-cookie";
export async function POST(request: NextRequest) {
    if (!getSameRequestOrigin(request))
        return NextResponse.json({ error: "無效來源。" }, { status: 403 });
    try {
        const reader = request.body?.getReader();
        if (!reader)
            throw new Error();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.length;
            if (size > 100000) {
                await reader.cancel();
                return NextResponse.json({ error: "請求過大。" }, { status: 413 });
            }
            chunks.push(part.value);
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        if (raw.length > 100000)
            return NextResponse.json({ error: "請求過大。" }, { status: 413 });
        const body = z.object({ operation: z.string(), data: z.unknown(), checkoutId: z.uuid().optional() }).parse(JSON.parse(raw));
        if (body.operation === "create" || body.operation === "quote") {
            const customer = await getCurrentCustomerAccount();
            if (!customer)
                return NextResponse.json({ error: "請先 LINE 登入。" }, { status: 401 });
            if (body.operation === "create")
                z.object({ quoteFingerprint: z.string().regex(/^[0-9a-f]{64}$/) }).parse(body.data);
            const binding = (await cookies()).get(STORE_SELECTION_BINDING_COOKIE)?.value;
            return NextResponse.json(await createCheckout(body.data, customer.id, binding, body.operation === "quote"));
        }
        const admin = await getCurrentAdmin();
        if (!admin)
            return NextResponse.json({ error: "需要管理員權限。" }, { status: 403 });
        const checkoutId = body.checkoutId;
        switch (body.operation) {
            case "store": {
                const data = pickupStoreInput.parse(body.data);
                await getDb().verifiedPickupStore.upsert({ where: { code: data.code }, create: data, update: data });
                break;
            }
            case "bank": {
                const data = bankInput.parse(body.data);
                await getDb().checkoutSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
                break;
            }
            case "rate": {
                const data = rateInput.parse(body.data);
                await getDb().shippingRate.upsert({ where: { method_temperature: { method: data.method, temperature: data.temperature } }, create: data, update: data });
                break;
            }
            case "expire":
                await expireCheckouts();
                break;
            case "receipt":
                if (!checkoutId)
                    throw new Error();
                await recordReceipt(checkoutId, admin.id, body.data);
                break;
            case "finalize":
                if (!checkoutId)
                    throw new Error();
                z.object({ confirmed: z.literal(true) }).parse(body.data);
                await finalizeCheckout(checkoutId, admin.id);
                break;
            case "anomaly": {
                if (!checkoutId)
                    throw new Error();
                const data = z.object({ reason: z.string(), note: z.string() }).parse(body.data);
                await flagAnomaly(checkoutId, admin.id, data.reason, data.note);
                break;
            }
            case "exception": {
                if (!checkoutId)
                    throw new Error();
                const data = z.object({ action: z.enum(["REFUND", "REBOOK"]), note: z.string(), confirmed: z.literal(true) }).parse(body.data);
                await resolveException(checkoutId, admin.id, data.action, data.note);
                break;
            }
            default: return NextResponse.json({ error: "無效操作。" }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof CheckoutError ? error.message : error instanceof ZodError ? "欄位格式無效。" : "操作失敗，請重新整理確認目前狀態後再重試。" }, { status: 400 });
    }
}
