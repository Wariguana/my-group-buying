import "server-only";

import { randomBytes } from "node:crypto";

export const ORDER_PUBLIC_CODE_PATTERN = /^ord-[A-Za-z0-9_-]{16}$/;

export type RandomBytesSource = (size: number) => Uint8Array;
export type OrderPublicCodeGenerator = () => string;

export function createOrderPublicCodeGenerator(
  randomBytesSource: RandomBytesSource = randomBytes,
): OrderPublicCodeGenerator {
  return () => `ord-${Buffer.from(randomBytesSource(12)).toString("base64url")}`;
}

export const generateOrderPublicCode = createOrderPublicCodeGenerator();
