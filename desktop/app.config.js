"use strict";

/**
 * Metahara Sugar Factory – Msf HomeDesk
 * Central Desktop Application Configuration
 *
 * Target: https://msf-homedesk.vercel.app
 */

const APP_URL = process.env.PORTAL_URL || "https://msf-homedesk.vercel.app";
const FALLBACK_URLS = ["https://house.taild2df63.ts.net"];

const APP_URLS = [APP_URL, ...FALLBACK_URLS];

const APP_NAME = "Msf HomeDesk";
const APP_SHORT_NAME = "HomeDesk";
const COMPANY_NAME = "Metahara Sugar Factory";
const DEPARTMENT = "Information Technology Department";
const DEVELOPER = "Temesgen G.";
const COPYRIGHT_YEAR = 2026;
const SUPPORT_EMAIL = "it@metaharasugar.com";
const WEBSITE_URL = "https://msf-homedesk.vercel.app";

// Window Geometry
const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 920;
const MIN_WINDOW_WIDTH = 1024;
const MIN_WINDOW_HEIGHT = 700;
const AUTO_RETRY_SECONDS = 12;

// Enterprise Color Tokens (Clean White Palette)
const THEME = {
  background: "#ffffff",
  surface: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  brand: "#0284c7", // Refined MSF Sky Blue
  brandDark: "#0369a1",
  brandLight: "#e0f2fe",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
};

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
  SUPPORT_EMAIL,
  WEBSITE_URL,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  AUTO_RETRY_SECONDS,
  THEME,
});
