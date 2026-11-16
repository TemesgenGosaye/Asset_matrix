"use strict";

/**
 * Central branding and connection settings.
 *
 * The portal address is intentionally defined once here. Change APP_URL
 * and rebuild the desktop client to point it at a different server.
 *
 * The client connects to APP_URL, the portal's public Tailscale Funnel
 * address. That host name is bound to the server's tailnet identity rather
 * than its LAN address, so the client keeps working when the server's DHCP
 * lease changes, and it is reachable from any network (including other
 * departments) without a VPN.
 */

const APP_URL = "https://house.taild2df63.ts.net/";

/**
 * No fallbacks. A bare 10.3.12.* address is DHCP-fragile and is unreachable
 * from other subnets, so a failed fallback would only delay the error screen.
 */
const FALLBACK_URLS = [];

/** Ordered connection candidates: primary first, then the fallbacks. */
const APP_URLS = [APP_URL, ...FALLBACK_URLS];

const APP_NAME = "Msf HomeDesk";
const APP_SHORT_NAME = "Msf HomeDesk";
const COMPANY_NAME = "Metahara Sugar Factory";
const DEPARTMENT = "IT Department";
const DEVELOPER = "Temesgen G.";
const COPYRIGHT_YEAR = 2026;

const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 900;
const MIN_WINDOW_WIDTH = 1024;
const MIN_WINDOW_HEIGHT = 680;
const AUTO_RETRY_SECONDS = 15;

module.exports = Object.freeze({
  APP_URL,
  APP_URLS,
  FALLBACK_URLS,
  APP_NAME,
  APP_SHORT_NAME,
  COMPANY_NAME,
  DEPARTMENT,
  DEVELOPER,
  COPYRIGHT_YEAR,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  AUTO_RETRY_SECONDS,
});
