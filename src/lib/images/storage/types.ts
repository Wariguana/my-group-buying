export type StoredImage = Readonly<{
  key: string;
  bytes: Uint8Array;
  contentType: "image/webp";
}>;

export interface ImageStorage {
  putObject(image: StoredImage): Promise<void>;
  deleteObject(key: string): Promise<void>;
  publicUrlForKey(key: string): string;
}
