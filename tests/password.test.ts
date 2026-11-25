import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, passwordPolicyError } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the correct password and rejects others", () => {
    const h = hashPassword("correct horse 42 battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse 42 battery", h)).toBe(true);
    expect(verifyPassword("wrong password 42", h)).toBe(false);
  });
  it("uses a random salt", () => {
    expect(hashPassword("same-password-1")).not.toEqual(hashPassword("same-password-1"));
  });
  it("rejects malformed or missing hashes", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "md5$abc")).toBe(false);
  });
  it("enforces the password policy", () => {
    expect(passwordPolicyError("short1")).toMatch(/12/);
    expect(passwordPolicyError("onlyletterslong")).toMatch(/letters and numbers/);
    expect(passwordPolicyError("letters-and-123")).toBeNull();
  });
});
