import * as otplib from "otplib";
import crypto from "crypto";

export function generateMfaSecret(): string {
  return otplib.generateSecret();
}

export function generateMfaUri(secret: string, email: string): string {
  return otplib.generateURI({
    issuer: "AssetTracker",
    label: email,
    secret,
    strategy: "totp",
  });
}

export function verifyMfaToken(secret: string, token: string): boolean {
  const result = otplib.verifySync({ token, secret });
  return result.valid;
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase(),
  );
}

export function verifyBackupCode(
  codes: string[],
  code: string,
): { valid: boolean; remainingCodes: string[] } {
  const normalizedCode = code.toUpperCase().replace(/-/g, "");
  const index = codes.indexOf(normalizedCode);
  if (index === -1) return { valid: false, remainingCodes: codes };
  const remainingCodes = [...codes];
  remainingCodes.splice(index, 1);
  return { valid: true, remainingCodes };
}
