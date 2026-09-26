/**
 * Re-authentication proof for sensitive config publishes.
 *
 * Momentary, HMAC-signed, single-purpose. After a user re-enters their
 * password (+ optional TOTP in routes), we issue a short-lived proof that is
 * bound to userId + organizationId. The publish route verifies it before
 * allowing ADMIN-only publishes (weights / eligibility / retention).
 *
 * The proof is NOT a session: it expires fast, is scoped to this one
 * operation class, and is keyed with a secret that is independent of the
 * BetterAuth session cookie.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const REAUTH_COOKIE = "engine_config_reauth";
export const REAUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Static HMAC secret for engine-config re-auth proofs.
 *
 * Independently keyed from the BetterAuth session: derived from
 * BETTER_AUTH_SECRET (a per-deployment static secret) with a
 * purpose-namespaced HMAC step, so an engine-config proof can never be
 * forged from a session token and vice-versa.
 */
export function getReauthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set — cannot issue engine-config re-auth proofs",
    );
  }
  return createHmac("sha256", "engine-config-reauth-v1")
    .update(secret)
    .digest("hex");
}

function base64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Issue a proof for `userId` scoped to `organizationId`.
 * Format: `<base64url("userId.orgId.expMs")>.<hex(payload) hex(expMs)>`.
 */
export function createReauthProof(input: {
  userId: string;
  organizationId: string;
  secret: string;
  ttlMs?: number;
  now?: number;
}): string {
  const now = input.now ?? Date.now();
  const exp = now + (input.ttlMs ?? REAUTH_TTL_MS);
  const payload = `${input.userId}.${input.organizationId}.${exp}`;
  const data = base64Url(payload);
  return `${data}.${hmacHex(data, input.secret)}`;
}

export interface ReauthProof {
  userId: string;
  organizationId: string;
  exp: number;
}

/**
 * Verify a proof. Returns the claims when valid and unexpired, else null.
 * Constant-time signature comparison.
 */
export function verifyReauthProof(
  token: string | null | undefined,
  secret: string,
): ReauthProof | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expected = hmacHex(data, secret);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: string;
  try {
    payload = Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [userId, organizationId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!userId || !organizationId || !Number.isFinite(exp)) return null;
  if (Date.now() >= exp) return null;

  return { userId, organizationId, exp };
}
