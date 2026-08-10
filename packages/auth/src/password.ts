import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/**
 * Password hashing for the credentials provider.
 *
 * Uses Node's built-in scrypt rather than a native dependency so the same code
 * runs in CI, tests and hosted Node without a compile step. Managed-auth
 * deployments never call this — those users simply have a null password hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;

  const salt = Buffer.from(saltPart, "base64");
  const expected = Buffer.from(hashPart, "base64");
  const derived = (await scryptAsync(password, salt, expected.length, SCRYPT_PARAMS)) as Buffer;

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
