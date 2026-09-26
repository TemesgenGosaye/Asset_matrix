/**
 * URL validation for SSRF protection.
 *
 * Validates that a URL does not point to private/internal networks,
 * cloud metadata endpoints, or non-HTTP(S) schemes before making
 * outbound requests (webhooks, Slack/Teams notifications, etc.).
 */

import dns from "dns/promises";
import { logger } from "@/lib/logger";

/**
 * Check whether an IPv4 address falls within a private/reserved range.
 *
 * Blocked ranges:
 *  - 0.0.0.0/8        (current network)
 *  - 10.0.0.0/8       (private, RFC 1918)
 *  - 100.64.0.0/10    (carrier-grade NAT, RFC 6598)
 *  - 127.0.0.0/8      (loopback)
 *  - 169.254.0.0/16   (link-local / cloud metadata)
 *  - 172.16.0.0/12    (private, RFC 1918)
 *  - 192.0.0.0/24     (IETF protocol assignments)
 *  - 192.0.2.0/24     (documentation, TEST-NET-1)
 *  - 192.168.0.0/16   (private, RFC 1918)
 *  - 198.18.0.0/15    (benchmark testing)
 *  - 198.51.100.0/24  (documentation, TEST-NET-2)
 *  - 203.0.113.0/24   (documentation, TEST-NET-3)
 *  - 224.0.0.0/4      (multicast)
 *  - 240.0.0.0/4      (reserved / broadcast)
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed → block
  }

  const [a, b] = parts;

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true;

  return false;
}

/**
 * Check whether an IPv6 address is loopback, link-local, or otherwise private.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1") return true;
  if (normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — extract the IPv4 part and check that
    const v4 = normalized.slice(7);
    if (v4.includes(".")) return isPrivateIPv4(v4);
  }

  return false;
}

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that a URL is safe for outbound requests (no SSRF).
 *
 * 1. Scheme must be http or https
 * 2. Hostname must not be empty
 * 3. Hostname must not resolve to a private/reserved IP
 */
export async function validateOutboundUrl(
  url: string,
): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // 1. Scheme check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "Only http and https URLs are allowed",
    };
  }

  // 2. Hostname present
  if (!parsed.hostname) {
    return { valid: false, error: "URL must include a hostname" };
  }

  // 3. Block common SSRF targets before DNS
  const hostname = parsed.hostname.toLowerCase();
  const blockedHostnames = [
    "localhost",
    "metadata.google.internal",
    "metadata.google",
  ];
  if (blockedHostnames.includes(hostname)) {
    return {
      valid: false,
      error: "This hostname is not allowed for outbound requests",
    };
  }

  // 4. If hostname is already an IP literal, check it directly
  if (
    parsed.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ||
    parsed.hostname.startsWith("[")
  ) {
    const ip = parsed.hostname.replace(/^\[|\]$/g, "");
    if (isPrivateIPv4(ip) || isPrivateIPv6(ip)) {
      return {
        valid: false,
        error: "URLs pointing to private/internal networks are not allowed",
      };
    }
    return { valid: true };
  }

  // 5. Resolve hostname and check all returned IPs
  try {
    const results = await dns.lookup(hostname, { all: true });

    for (const result of results) {
      const isPrivate =
        result.family === 4
          ? isPrivateIPv4(result.address)
          : isPrivateIPv6(result.address);

      if (isPrivate) {
        logger.warn("SSRF attempt blocked: hostname resolves to private IP", {
          url,
          hostname,
          resolvedIp: result.address,
        });
        return {
          valid: false,
          error: "URLs pointing to private/internal networks are not allowed",
        };
      }
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: "Could not resolve hostname",
    };
  }
}
