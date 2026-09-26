import { describe, it, expect } from "vitest";
import {
  generateMfaSecret,
  generateMfaUri,
  verifyMfaToken,
  generateBackupCodes,
  verifyBackupCode,
} from "@/lib/mfa";

describe("generateMfaSecret", () => {
  it("returns a non-empty string", () => {
    const secret = generateMfaSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
  });

  it("generates unique secrets on successive calls", () => {
    const secrets = new Set(
      Array.from({ length: 20 }, () => generateMfaSecret()),
    );
    expect(secrets.size).toBe(20);
  });
});

describe("generateMfaUri", () => {
  it("returns a valid otpauth:// URI", () => {
    const secret = generateMfaSecret();
    const uri = generateMfaUri(secret, "user@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
  });

  it("includes the email in the URI", () => {
    const secret = generateMfaSecret();
    const uri = generateMfaUri(secret, "alice@example.com");
    expect(uri).toContain("alice");
  });

  it("includes the issuer parameter as AssetTracker", () => {
    const secret = generateMfaSecret();
    const uri = generateMfaUri(secret, "user@example.com");
    expect(uri).toContain("issuer=AssetTracker");
  });

  it("includes the secret parameter", () => {
    const secret = generateMfaSecret();
    const uri = generateMfaUri(secret, "user@example.com");
    expect(uri).toContain(`secret=${secret}`);
  });
});

describe("verifyMfaToken", () => {
  it("accepts a valid TOTP token generated from the same secret", async () => {
    const { generateSync, generateSecret } = await import("otplib");
    const secret = generateSecret();
    const token = generateSync({ secret });
    const result = verifyMfaToken(secret, token);
    expect(result).toBe(true);
  });

  it("rejects an invalid token", () => {
    const secret = generateMfaSecret();
    expect(verifyMfaToken(secret, "000000")).toBe(false);
  });

  it("throws on empty token", () => {
    const secret = generateMfaSecret();
    expect(() => verifyMfaToken(secret, "")).toThrow();
  });
});

describe("generateBackupCodes", () => {
  it("generates 8 codes by default", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
  });

  it("generates a custom number of codes", () => {
    expect(generateBackupCodes(4)).toHaveLength(4);
    expect(generateBackupCodes(12)).toHaveLength(12);
  });

  it("generates codes in uppercase hex format (8 chars each)", () => {
    const codes = generateBackupCodes();
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    }
  });

  it("generates unique codes within a single batch", () => {
    const codes = generateBackupCodes(50);
    const unique = new Set(codes);
    expect(unique.size).toBe(50);
  });
});

describe("verifyBackupCode", () => {
  it("validates a correct backup code", () => {
    const codes = generateBackupCodes();
    const target = codes[0];
    const result = verifyBackupCode(codes, target);
    expect(result.valid).toBe(true);
    expect(result.remainingCodes).not.toContain(target);
    expect(result.remainingCodes).toHaveLength(codes.length - 1);
  });

  it("rejects an invalid backup code", () => {
    const codes = generateBackupCodes();
    const result = verifyBackupCode(codes, "ZZZZZZZZ");
    expect(result.valid).toBe(false);
    expect(result.remainingCodes).toEqual(codes);
  });

  it("is case-insensitive", () => {
    const codes = generateBackupCodes();
    const target = codes[2];
    const result = verifyBackupCode(codes, target.toLowerCase());
    expect(result.valid).toBe(true);
  });

  it("strips dashes from input before matching", () => {
    const codes = generateBackupCodes();
    const target = codes[0];
    const dashedCode = target.slice(0, 4) + "-" + target.slice(4);
    const result = verifyBackupCode(codes, dashedCode);
    expect(result.valid).toBe(true);
  });

  it("handles empty codes array", () => {
    const result = verifyBackupCode([], "ABCDEF12");
    expect(result.valid).toBe(false);
    expect(result.remainingCodes).toEqual([]);
  });

  it("removes only the matched code, leaving others intact", () => {
    const codes = ["AAAA1111", "BBBB2222", "CCCC3333"];
    const result = verifyBackupCode(codes, "BBBB2222");
    expect(result.valid).toBe(true);
    expect(result.remainingCodes).toEqual(["AAAA1111", "CCCC3333"]);
  });
});
