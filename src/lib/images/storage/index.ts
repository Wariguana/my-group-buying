import "server-only";

import { isE2eImageStorageEnabled, readImageStorageConfig } from "./config";
import { createE2eImageStorage } from "./e2e";
import { createS3ImageStorage } from "./s3";
import type { ImageStorage } from "./types";

let storage: ImageStorage | undefined;

export function getImageStorage(): ImageStorage {
  storage ??= isE2eImageStorageEnabled()
    ? createE2eImageStorage()
    : createS3ImageStorage(readImageStorageConfig());
  return storage;
}

export type { ImageStorage } from "./types";
