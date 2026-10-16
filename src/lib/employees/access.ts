/**
 * Employee module RBAC helpers.
 *
 * Keeping the permission predicate here (rather than inline in route handlers)
 * means the "who may see an unmasked National ID" rule is defined once and
 * cannot drift between the list endpoint, the detail endpoint, the export and
 * the import preview.
 */

import { hasAnyPermission, type Permission } from "@/lib/rbac";
import type { AuthUser } from "@/lib/api-auth";

/**
 * Permissions that grant sight of unmasked National ID data.
 *
 * The explicit `employee:sensitive_view` grant is the primary way to get
 * unmasked values; `employee:edit` / `employee:delete` also imply it, because
 * whoever maintains the employee record needs to read the identifier they are
 * editing. `employee:view` alone yields masked values.
 */
export const SENSITIVE_EMPLOYEE_PERMISSIONS = [
  "employee:sensitive_view",
  "employee:edit",
  "employee:delete",
] as const satisfies readonly Permission[];

/**
 * Decide whether `user` may receive unmasked National ID values.
 *
 * Admins always may (they bypass RBAC inside `requirePermission`, so we mirror
 * that here). API-key callers must carry one of the sensitive scopes.
 */
export async function canViewSensitiveEmployeeData(
  user: AuthUser,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!user.id) return false;

  // API-key auth: require an explicit sensitive scope rather than falling
  // through to the user's role permissions, matching `requirePermission`.
  if (user.apiKeyScopes !== undefined) {
    return SENSITIVE_EMPLOYEE_PERMISSIONS.some((p) =>
      user.apiKeyScopes!.includes(p),
    );
  }

  return hasAnyPermission(user.id, [...SENSITIVE_EMPLOYEE_PERMISSIONS]);
}
