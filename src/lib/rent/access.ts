/**
 * Rent module RBAC helpers.
 *
 * Keeping the permission predicate here (rather than inline in route handlers)
 * means the "who may see an unmasked National ID" rule is defined once and
 * cannot drift between the list endpoint, the detail endpoint, the export and
 * the receipt print.
 *
 * Mirrors src/lib/employees/access.ts.
 */

import { hasAnyPermission, type Permission } from "@/lib/rbac";
import type { AuthUser } from "@/lib/api-auth";

/**
 * Permissions that grant sight of unmasked National ID data.
 *
 * The explicit `rent:sensitive_view` grant is the primary way to get unmasked
 * values; `rent:update` also implies it, because whoever edits the renter needs
 * to read the identifier they are editing (you cannot spot a transcription error
 * in a masked value). `rent:view` alone yields masked values.
 */
export const SENSITIVE_RENT_PERMISSIONS = [
  "rent:sensitive_view",
  "rent:update",
  "rent:terminate",
] as const satisfies readonly Permission[];

/**
 * Decide whether `user` may receive unmasked National ID values.
 *
 * Admins always may (they bypass RBAC inside `requirePermission`, so we mirror
 * that here). API-key callers must carry one of the sensitive scopes.
 */
export async function canViewSensitiveRentData(
  user: AuthUser,
): Promise<boolean> {
  if (!user.id) return false;

  // API-key auth FIRST: scope enforcement applies to ALL callers, including
  // admins (see `requirePermission`), so an admin's API key must still carry an
  // explicit sensitive scope. The admin short-circuit is a session-only bypass.
  if (user.apiKeyScopes !== undefined) {
    return SENSITIVE_RENT_PERMISSIONS.some((p) =>
      user.apiKeyScopes!.includes(p),
    );
  }

  if (user.isAdmin) return true;

  return hasAnyPermission(user.id, [...SENSITIVE_RENT_PERMISSIONS]);
}

/** Permission set the page and dialogs are gated on. */
export interface RentCapabilities {
  view: boolean;
  create: boolean;
  update: boolean;
  pay: boolean;
  void: boolean;
  terminate: boolean;
  export: boolean;
  archive: boolean;
  overrideTerms: boolean;
  sensitive: boolean;
}

/**
 * Build the capability map the client components use to decide which controls to
 * render.
 *
 * This is PRESENTATION ONLY. Every one of these capabilities is re-checked on the
 * server by `requirePermission`; hiding a button is never the enforcement.
 */
export function buildRentCapabilities(
  has: (permission: Permission) => boolean,
  isAdmin: boolean,
): RentCapabilities {
  const granted = (permission: Permission) => isAdmin || has(permission);
  return {
    view: granted("rent:view"),
    create: granted("rent:create"),
    update: granted("rent:update"),
    pay: granted("rent:pay"),
    void: granted("rent:void"),
    terminate: granted("rent:terminate"),
    export: granted("rent:export"),
    archive: granted("rent:archive"),
    overrideTerms: granted("rent:override_terms"),
    sensitive: granted("rent:sensitive_view"),
  };
}
