import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const N = 16384;
const KEYLEN = 64;

/** scrypt password hash: "scrypt$N$saltB64$hashB64" */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N });
  return `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, nStr, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(nStr),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return "Password must contain letters and numbers.";
  return null;
}
