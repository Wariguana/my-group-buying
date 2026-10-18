import { enforceRateLimit } from "@/lib/operations/rate-limit";
import { NextRequest } from "next/server";
import { getSameRequestOrigin } from "@/lib/http/request-origin";
import { getCurrentCustomerAccount } from "@/lib/customer-auth/current-customer";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { getDb } from "@/lib/db";
import { reportTransfer, CheckoutError } from "@/lib/checkout/service";
import { MAX_SCREENSHOT_BYTES } from "@/lib/checkout/screenshot";
import { z } from "zod";
export async function POST(request: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    if (!getSameRequestOrigin(request))
        return Response.json({ error: "無效來源。" }, { status: 403 });
    const customer = await getCurrentCustomerAccount();
    if (!customer)
        return Response.json({ error: "請先登入。" }, { status: 401 });
    try {
        await enforceRateLimit("screenshot", customer.id, 10);
        const checkoutId = z.uuid().parse((await params).id);
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
            if (size > MAX_SCREENSHOT_BYTES) {
                await reader.cancel();
                return Response.json({ error: "截圖上限 5 MB。" }, { status: 413 });
            }
            chunks.push(part.value);
        }
        await reportTransfer(checkoutId, customer.id, request.headers.get("x-last-five") ?? "", Buffer.concat(chunks));
        return Response.json({ ok: true });
    }
    catch (error) {
        return Response.json({ error: error instanceof CheckoutError ? error.message : "請提供有效的 JPG／PNG 截圖（上限 5 MB）與末五碼。" }, { status: 400 });
    }
}
export async function GET(_request: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const parsed = z.uuid().safeParse((await params).id);
    if (!parsed.success)
        return new Response(null, { status: 404 });
    const [admin, customer] = await Promise.all([getCurrentAdmin(), getCurrentCustomerAccount()]);
    if (!admin && !customer)
        return new Response(null, { status: 401 });
    const checkout = await getDb().checkout.findFirst({ where: { id: parsed.data, ...(!admin ? { customerAccountId: customer!.id } : {}) }, select: { payment: { select: { bankReport: true } } } });
    const report = checkout?.payment?.bankReport;
    if (!report)
        return new Response(null, { status: 404 });
    return new Response(Buffer.from(report.screenshot), { headers: { "Content-Type": report.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename=transfer.png", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
