import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { storage, createFileToken, verifyFileToken, sniffMatches, safeFilename } from "@/lib/storage";

describe("encrypted local storage", () => {
  it("round-trips data and stores ciphertext at rest", async () => {
    const plain = Buffer.from("FICTIONAL demo statement audio bytes ".repeat(20));
    const obj = await storage().put(plain, "recordings");
    expect(obj.size).toBe(plain.length);
    expect(obj.sha256).toMatch(/^[0-9a-f]{64}$/);
    const onDisk = fs.readFileSync(path.resolve(process.env.STORAGE_DIR!, obj.key));
    expect(onDisk.subarray(0, 4).toString()).toBe("FRE1");
    expect(onDisk.includes(Buffer.from("FICTIONAL demo"))).toBe(false);
    expect((await storage().get(obj.key)).equals(plain)).toBe(true);
    await storage().delete(obj.key);
    await expect(storage().get(obj.key)).rejects.toThrow();
  });

  it("detects tampering with stored ciphertext", async () => {
    const obj = await storage().put(Buffer.from("hello world"), "attachments");
    const file = path.resolve(process.env.STORAGE_DIR!, obj.key);
    const buf = fs.readFileSync(file);
    buf[buf.length - 1] ^= 0xff;
    fs.writeFileSync(file, buf);
    await expect(storage().get(obj.key)).rejects.toThrow();
  });

  it("rejects path traversal keys and prefixes", async () => {
    await expect(storage().get("../../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(storage().put(Buffer.from("x"), "../evil")).rejects.toThrow(/Invalid storage prefix/);
  });
});

describe("file access tokens", () => {
  it("accepts valid tokens bound to kind, id and user", () => {
    const t = createFileToken("recording", "rec-1", "user-1");
    expect(verifyFileToken("recording", "rec-1", "user-1", t)).toBe(true);
    expect(verifyFileToken("recording", "rec-1", "user-2", t)).toBe(false);
    expect(verifyFileToken("attachment", "rec-1", "user-1", t)).toBe(false);
    expect(verifyFileToken("recording", "rec-2", "user-1", t)).toBe(false);
    expect(verifyFileToken("recording", "rec-1", "user-1", null)).toBe(false);
  });
  it("rejects expired and tampered tokens", () => {
    const t = createFileToken("attachment", "a", "u");
    const [, sig] = t.split(".");
    expect(verifyFileToken("attachment", "a", "u", `${Date.now() - 1000}.${sig}`)).toBe(false);
    expect(verifyFileToken("attachment", "a", "u", `${Date.now() + 10 ** 9}.${sig}`)).toBe(false);
    expect(verifyFileToken("attachment", "a", "u", t.slice(0, -2) + "xx")).toBe(false);
  });
});

describe("upload validation", () => {
  it("matches magic bytes to declared types", () => {
    expect(sniffMatches("application/pdf", Buffer.from("%PDF-1.7 ..."))).toBe(true);
    expect(sniffMatches("application/pdf", Buffer.from("MZ\x90\x00 executable"))).toBe(false);
    expect(sniffMatches("image/png", Buffer.from("89504e470d0a1a0a", "hex"))).toBe(true);
    expect(sniffMatches("image/jpeg", Buffer.from("ffd8ffe0", "hex"))).toBe(true);
    expect(sniffMatches("audio/webm", Buffer.from("1a45dfa3", "hex"))).toBe(true);
    expect(sniffMatches("text/plain", Buffer.from([0x41, 0x00, 0x42]))).toBe(false);
    expect(sniffMatches("application/x-msdownload", Buffer.from("MZ"))).toBe(false);
  });
  it("sanitises filenames", () => {
    expect(safeFilename("../../a<b>.pdf")).toBe(".._.._a_b_.pdf");
    expect(safeFilename("")).toBe("file");
  });
});
