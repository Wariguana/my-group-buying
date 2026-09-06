import "server-only";

import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

const MEMORY = 19456;
const PASSES = 2;
const PARALLELISM = 1;
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;
const PARAMETERS = `m=${MEMORY},t=${PASSES},p=${PARALLELISM},l=${TAG_LENGTH}`;
const PREFIX = `v1$argon2id$${PARAMETERS}$`;
const ENCODED_LENGTH = PREFIX.length + 22 + 1 + 43;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: password,
        nonce: salt,
        memory: MEMORY,
        passes: PASSES,
        parallelism: PARALLELISM,
        tagLength: TAG_LENGTH,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      },
    );
  });
}

function decodeBase64url(value: string, byteLength: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const decoded = Buffer.from(value, "base64url");
  // Buffer decoding is permissive; require canonical unpadded base64url.
  if (decoded.length !== byteLength || decoded.toString("base64url") !== value) {
    return null;
  }
  return decoded;
}

function parseHash(encodedHash: string) {
  if (typeof encodedHash !== "string" || encodedHash.length !== ENCODED_LENGTH) {
    return null;
  }

  const fields = encodedHash.split("$");
  // Auth v1 accepts only this policy, including canonical numeric fields.
  // Reject other costs before invoking Argon2 to bound verification resources.
  if (
    fields.length !== 5 ||
    fields[0] !== "v1" ||
    fields[1] !== "argon2id" ||
    fields[2] !== PARAMETERS
  ) {
    return null;
  }

  const salt = decodeBase64url(fields[3], SALT_LENGTH);
  const hash = decodeBase64url(fields[4], TAG_LENGTH);
  return salt && hash ? { salt, hash } : null;
}

/** Application-specific v1 format; this is not a standard PHC string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await deriveKey(password, salt);
  return `${PREFIX}${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const parsed = parseHash(encodedHash);
  if (!parsed) return false;

  const derivedHash = await deriveKey(password, parsed.salt);
  return timingSafeEqual(derivedHash, parsed.hash);
}
