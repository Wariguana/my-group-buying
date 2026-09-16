import "server-only";

export type ImageStorageConfig = Readonly<{
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}>;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value || value.trim() !== value) throw new Error("Image storage is not configured.");
  return value;
}

function validHttpUrl(value: string, production: boolean): string {
  try {
    const parsed = new URL(value);
    const protocolAllowed = production
      ? parsed.protocol === "https:"
      : parsed.protocol === "https:" || parsed.protocol === "http:";
    if (!parsed.hostname || !protocolAllowed) throw new Error();
    return value.replace(/\/$/, "");
  } catch {
    throw new Error("Image storage is not configured.");
  }
}

export function isE2eImageStorageEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.E2E_GROUP_BUY_IMAGE_STORAGE !== "1" || !environment.DATABASE_URL) return false;
  try {
    const url = new URL(environment.DATABASE_URL);
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    return (url.protocol === "postgresql:" || url.protocol === "postgres:")
      && new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)
      && new Set(["5432", "5433"]).has(url.port)
      && /^my_group_buying_e2e_[a-f0-9]{32}$/.test(databaseName)
      && url.search === ""
      && url.hash === "";
  } catch {
    return false;
  }
}

export function readImageStorageConfig(environment: NodeJS.ProcessEnv = process.env): ImageStorageConfig {
  const production = environment.NODE_ENV === "production";
  return Object.freeze({
    endpoint: validHttpUrl(required(environment, "GROUP_BUY_IMAGE_STORAGE_ENDPOINT"), production),
    region: required(environment, "GROUP_BUY_IMAGE_STORAGE_REGION"),
    bucket: required(environment, "GROUP_BUY_IMAGE_STORAGE_BUCKET"),
    accessKeyId: required(environment, "GROUP_BUY_IMAGE_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: required(environment, "GROUP_BUY_IMAGE_STORAGE_SECRET_ACCESS_KEY"),
    publicBaseUrl: validHttpUrl(required(environment, "GROUP_BUY_IMAGE_PUBLIC_BASE_URL"), production),
  });
}
