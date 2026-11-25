/**
 * Storage adapter for recordings and attachments.
 *
 * The default adapter writes to a local directory outside the web root and
 * encrypts every object with AES-256-GCM when STORAGE_ENCRYPTION_KEY is set.
 * Other backends (S3-compatible object storage, etc.) can implement
 * `StorageAdapter`; none are bundled.
 */
import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { newId } from "@/lib/db";

export interface StoredObject {
  key: string;
  sha256: string;
  size: number;
}

export interface StorageAdapter {
  name: string;
  put(data: Buffer, prefix: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const MAGIC = Buffer.from("FRE1"); // FirstRecord encrypted v1

class LocalStorageAdapter implements StorageAdapter {
  name = "local-filesystem";

  private resolve(key: string) {
    if (!/^[a-z]+\/[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid storage key");
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), config.storageDir, key);
  }

  async put(data: Buffer, prefix: string): Promise<StoredObject> {
    if (!/^[a-z]+$/.test(prefix)) throw new Error("Invalid storage prefix");
    const key = `${prefix}/${newId()}`;
    const file = this.resolve(key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const sha256 = createHash("sha256").update(data).digest("hex");
    const k = config.storageKey;
    let payload = data;
    if (k) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", k, iv);
      const enc = Buffer.concat([cipher.update(data), cipher.final()]);
      payload = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]);
    }
    await fs.promises.writeFile(file, payload, { mode: 0o600 });
    // Verify the write actually landed before reporting success.
    const stat = await fs.promises.stat(file);
    if (stat.size !== payload.length) throw new Error("Storage write verification failed");
    return { key, sha256, size: data.length };
  }

  async get(key: string): Promise<Buffer> {
    const raw = await fs.promises.readFile(this.resolve(key));
    if (raw.subarray(0, 4).equals(MAGIC)) {
      const k = config.storageKey;
      if (!k) throw new Error("Object is encrypted but STORAGE_ENCRYPTION_KEY is not configured");
      const iv = raw.subarray(4, 16);
      const tag = raw.subarray(16, 32);
      const decipher = createDecipheriv("aes-256-gcm", k, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(raw.subarray(32)), decipher.final()]);
    }
    return raw;
  }

  async delete(key: string): Promise<void> {
    await fs.promises.rm(this.resolve(key), { force: true });
  }
}

let adapter: StorageAdapter | null = null;
export function storage(): StorageAdapter {
  return (adapter ??= new LocalStorageAdapter());
}

/* ---------- Expiring, user-bound file access tokens ---------- */

const TOKEN_TTL_MS = 5 * 60 * 1000;

function sign(payload: string) {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

/** Create a short-lived token binding a file to a user. Contains ids only — no content. */
export function createFileToken(kind: "recording" | "attachment", id: string, userId: string) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${kind}.${id}.${userId}.${exp}`;
  return `${exp}.${sign(payload)}`;
}

export function verifyFileToken(kind: string, id: string, userId: string, token: string | null): boolean {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  const expected = Buffer.from(sign(`${kind}.${id}.${userId}.${exp}`));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ---------- Upload validation ---------- */

export const ALLOWED_ATTACHMENT_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "video/mp4": [".mp4"],
};

export const ALLOWED_RECORDING_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "video/webm", "video/mp4"];

/** Check magic bytes for common types so a renamed executable is rejected. */
export function sniffMatches(mime: string, data: Buffer): boolean {
  const b = data.subarray(0, 12);
  const hex = b.toString("hex");
  switch (mime) {
    case "application/pdf":
      return b.subarray(0, 4).toString() === "%PDF";
    case "image/png":
      return hex.startsWith("89504e47");
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/webp":
      return b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
    case "audio/wav":
      return b.subarray(0, 4).toString() === "RIFF";
    case "audio/mpeg":
      return hex.startsWith("494433") || hex.startsWith("fffb") || hex.startsWith("fff3");
    case "video/mp4":
    case "audio/mp4":
      return b.subarray(4, 8).toString() === "ftyp";
    case "audio/webm":
    case "video/webm":
      return hex.startsWith("1a45dfa3");
    case "audio/ogg":
      return b.subarray(0, 4).toString() === "OggS";
    case "text/plain":
      return !data.subarray(0, 1024).includes(0);
    default:
      return false;
  }
}

export function safeFilename(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}
