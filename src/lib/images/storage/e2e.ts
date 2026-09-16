import "server-only";

import type { ImageStorage } from "./types";

const globalStore = globalThis as typeof globalThis & {
  groupBuyE2eImages?: Map<string, Uint8Array>;
};

export function getE2eImageBytes(key: string): Uint8Array | undefined {
  return globalStore.groupBuyE2eImages?.get(key);
}

export function createE2eImageStorage(): ImageStorage {
  const objects = globalStore.groupBuyE2eImages ??= new Map();
  return {
    async putObject(image) { objects.set(image.key, image.bytes); },
    async deleteObject(key) { objects.delete(key); },
    publicUrlForKey(key) { return `/api/group-buy-images/e2e/${key.split("/").map(encodeURIComponent).join("/")}`; },
  };
}
