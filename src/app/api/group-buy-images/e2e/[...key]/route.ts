import { isE2eImageStorageEnabled } from "@/lib/images/storage/config";
import { getE2eImageBytes } from "@/lib/images/storage/e2e";

export async function GET(_request: Request, context: RouteContext<"/api/group-buy-images/e2e/[...key]">) {
  if (!isE2eImageStorageEnabled()) return new Response(null, { status: 404 });
  const { key } = await context.params;
  const bytes = getE2eImageBytes(key.map(decodeURIComponent).join("/"));
  if (!bytes) return new Response(null, { status: 404 });
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { "content-type": "image/webp", "cache-control": "no-store" } });
}
