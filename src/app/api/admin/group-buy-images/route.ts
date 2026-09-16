import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { InvalidImageUploadError, MAX_RAW_IMAGE_BYTES } from "@/lib/images/normalize";
import { cleanupExpiredPendingUploads, createPendingGroupBuyImageUpload } from "@/lib/images/pending-upload-service";

const MAX_MULTIPART_BYTES = MAX_RAW_IMAGE_BYTES + 64 * 1024;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return error(401, "請先登入管理後台。");

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return error(403, "無法驗證上傳來源。");
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) return error(413, "圖片檔案不可超過 8 MB。");

  try {
    const formData = await request.formData();
    const entries = [...formData.entries()];
    if (entries.length !== 1 || entries[0][0] !== "image" || !(entries[0][1] instanceof File)) {
      return error(400, "請選擇一張圖片。");
    }
    const file = entries[0][1];
    if (file.size === 0 || file.size > MAX_RAW_IMAGE_BYTES) return error(413, "圖片檔案不可超過 8 MB。");
    await cleanupExpiredPendingUploads();
    const upload = await createPendingGroupBuyImageUpload(admin.id, new Uint8Array(await file.arrayBuffer()));
    return Response.json(upload, { status: 201 });
  } catch (caught) {
    if (caught instanceof InvalidImageUploadError) return error(415, "只接受有效的 JPEG、PNG 或 WebP 圖片。");
    return error(500, "圖片上傳失敗，請稍後再試。");
  }
}
