/**
 * Deployment mode detection.
 *
 * Set SELF_HOSTED=true in env to enable self-hosted mode (e.g. landing page
 * redirects straight to login/dashboard).
 *
 * Org scoping remains active in both modes (harmless for single-tenant,
 * keeps data structured correctly for potential future migration to SaaS).
 */
export function isSelfHosted(): boolean {
  return process.env.SELF_HOSTED === "true";
}
