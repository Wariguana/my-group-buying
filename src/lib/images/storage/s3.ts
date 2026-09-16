import "server-only";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ImageStorage } from "./types";
import type { ImageStorageConfig } from "./config";

export function createS3ImageStorage(config: ImageStorageConfig): ImageStorage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async putObject(image) {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: image.key,
        Body: image.bytes,
        ContentType: image.contentType,
      }));
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    publicUrlForKey(key) {
      return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
    },
  };
}
