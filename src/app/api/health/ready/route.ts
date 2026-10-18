import { getDb } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([getDb().$queryRaw`SELECT 1`, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("READINESS_TIMEOUT")), 4000); })]);
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  finally { clearTimeout(timer); }
}
