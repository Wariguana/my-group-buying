export class JsonRequestError extends Error {
  constructor(message: string, public readonly fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "JsonRequestError";
  }
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  let result;
  try { result = await response.json(); }
  catch { throw new Error("連線中斷或服務暫時無法回應。請重新整理確認目前狀態後再重試。"); }
  if (!response.ok) {
    const fieldErrors: Record<string, string[]> = {};
    if (result?.fieldErrors && typeof result.fieldErrors === "object") {
      for (const [key, value] of Object.entries(result.fieldErrors)) {
        if (Array.isArray(value) && value.every(item => typeof item === "string")) fieldErrors[key] = value;
      }
    }
    throw new JsonRequestError(typeof result?.error === "string" ? result.error : "操作未完成，請重新整理確認目前狀態後再重試。", fieldErrors);
  }
  return result as T;
}

export async function requestJson<T>(url: string, options: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, options); }
  catch { throw new Error("目前無法連線。請重新整理確認目前狀態後再重試，勿重複付款。"); }
  return readJsonResponse<T>(response);
}
