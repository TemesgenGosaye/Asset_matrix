import prisma from "./prisma";

/**
 * Available permissions in the system
 */
export const PERMISSIONS = {
  // Assets
  "asset:view": "View assets",
  "asset:create": "Create assets",
  "asset:edit": "Edit assets",
  "asset:delete": "Delete assets",
  "asset:assign": "Assign assets to users",

  // Users
  "user:view": "View users",
  "user:create": "Create users",
  "user:edit": "Edit users",
  "user:delete": "Delete users",

  // Accessories
  "accessory:view": "View accessories",
  "accessory:create": "Create accessories",
  "accessory:edit": "Edit accessories",
  "accessory:delete": "Delete accessories",

  // Licenses
  "license:view": "View licenses",
  "license:create": "Create licenses",
  "license:edit": "Edit licenses",
  "license:delete": "Delete licenses",
  "license:assign": "Assign licenses",

  // Consumables
  "consumable:view": "View consumables",
  "consumable:create": "Create consumables",
  "consumable:edit": "Edit consumables",
  "consumable:delete": "Delete consumables",

  // Organizations & Departments
  "org:view": "View organizations",
  "org:manage": "Manage organizations",
  "dept:view": "View departments",
  "dept:manage": "Manage departments",

  // Reservations
  "reservation:view": "View reservations",
  "reservation:create": "Create reservations",
  "reservation:approve": "Approve/reject reservations",

  // Settings
  "settings:view": "View settings",
  "settings:edit": "Edit settings",

  // Reports
  "report:view": "View reports",
  "report:export": "Export reports",

  // Audit logs
  "audit:view": "View audit logs",

  // Webhooks
  "webhook:view": "View webhooks",
  "webhook:manage": "Manage webhooks",

  // Import
  "import:execute": "Execute bulk imports",

  // Procurement
  "procurement:view": "View purchase requests and orders",
  "procurement:create": "Create purchase requests",
  "procurement:approve": "Approve or reject purchase requests",
  "procurement:manage_orders": "Manage purchase orders and generate POs",
  "procurement:receive": "Record goods receipts",

  // Components
  "component:view": "View components",
  "component:create": "Create components",
  "component:edit": "Edit components",
  "component:delete": "Delete components",

  // Kits
  "kit:view": "View predefined kits",
  "kit:create": "Create predefined kits",
  "kit:edit": "Edit predefined kits",
  "kit:delete": "Delete predefined kits",
  "kit:checkout": "Checkout predefined kits",

  // Audits
  "audit_campaign:view": "View audit campaigns",
  "audit_campaign:create": "Create audit campaigns",
  "audit_campaign:edit": "Edit audit campaigns",
  "audit_campaign:scan": "Scan assets in audit campaigns",

  // Employees (HR)
  "employee:view": "View employees",
  "employee:create": "Create employees",
  "employee:edit": "Edit employees",
  "employee:delete": "Delete employees",
  "employee:restore": "Restore archived (soft-deleted) employees",
  "employee:export": "Export the employee register",
  "employee:import": "Bulk import employees from a spreadsheet",
  /**
   * Reveal unmasked National ID values. Not required for `employee:edit`, but
   * the default employee list/detail responses treat the absence of this
   * permission as "mask the National ID" rather than "hide the column".
   */
  "employee:sensitive_view": "View unmasked National ID values",

  // Household Management
  "household:view": "View households",
  "household:create": "Create households",
  "household:edit": "Edit households",
  "household:delete": "Delete households",

  // General Assets
  "general_asset:view": "View general assets",
  "general_asset:create": "Create general assets",
  "general_asset:edit": "Edit general assets",
  "general_asset:delete": "Delete general assets",

  // House Queue
  "house_queue:view": "View the house queue and recommendations",
  "house_queue:allocate": "Approve/reassign house allocations",
  "house_queue:manage": "Skip, defer, release and recalculate the house queue",
  "house_queue:audit": "View house queue audit trails",

  // House Requests (the employee's own application that admits them to the queue)
  "house_request:create":
    "Look up an employee and submit a house request on their behalf",
  "house_request:view": "View house requests and their current status",
  "house_request:manage": "Cancel or close house requests",

  // House Queue Engine Configuration
  "engine_config:view": "View engine configuration and version history",
  "engine_config:edit": "Create and edit a draft engine configuration",
  "engine_config:preview": "Preview the impact of a draft before publishing",
  "engine_config:publish":
    "Publish low/medium blast-radius config changes (recommendation rules)",
  "engine_config:publish_high_risk":
    "Publish high/critical config changes (weights, eligibility bands). Server requires Admin.",
  "engine_config:run": "Manually trigger an engine recompute (Run Now)",
  "engine_config:rollback":
    "Roll back to an archived engine configuration. Server requires Admin.",
  "engine_config:audit":
    "View the field-level engine configuration audit trail",

  // Pay Rent (house / shop / grocery rent management)
  "rent:view": "View renters, their rent schedules and payment history",
  "rent:create": "Register a renter and generate their rent schedule",
  "rent:update": "Edit renter details and unpaid months' rent amount",
  "rent:pay": "Record a rent payment and issue a receipt",
  "rent:void": "Void a recorded rent payment (month reverts to unpaid)",
  "rent:terminate": "Terminate a lease, voiding its remaining unpaid months",
  "rent:archive": "Archive and restore renter records",
  "rent:export": "Export the rent register and printable statements",
  /**
   * Elevated: change the rent start date or lease term after payments exist.
   * Requires a written reason and is fully audited. The service still refuses to
   * regenerate a schedule that would re-date an already-issued receipt.
   */
  "rent:override_terms":
    "Change the rent start date or lease term after payments exist",
  /**
   * Reveal unmasked National ID values. `rent:view` alone yields masked values;
   * `rent:update` / `rent:terminate` imply it because you cannot verify the
   * identifier you are editing while it is masked.
   */
  "rent:sensitive_view": "View unmasked renter National ID values",
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Default role definitions
 */
export const DEFAULT_ROLES = {
  admin: {
    name: "Administrator",
    description: "Full system access",
    permissions: Object.keys(PERMISSIONS) as Permission[],
    isSystem: true,
  },
  manager: {
    name: "Asset Manager",
    description: "Can manage assets and assignments",
    permissions: [
      "asset:view",
      "asset:create",
      "asset:edit",
      "asset:assign",
      "accessory:view",
      "accessory:create",
      "accessory:edit",
      "license:view",
      "license:assign",
      "consumable:view",
      "component:view",
      "component:create",
      "component:edit",
      "kit:view",
      "kit:checkout",
      "employee:view",
      "employee:export",
      "employee:sensitive_view",
      "household:view",
      "household:create",
      "household:edit",
      "general_asset:view",
      "general_asset:create",
      "general_asset:edit",
      "house_queue:view",
      "house_queue:allocate",
      "house_queue:manage",
      "house_queue:audit",
      "house_request:create",
      "house_request:view",
      "house_request:manage",
      "engine_config:view",
      "engine_config:edit",
      "engine_config:preview",
      "engine_config:publish",
      "engine_config:run",
      "engine_config:audit",
      // Pay Rent: the Facility & House module's finance surface. Same audience as
      // the rest of the housing permissions (Asset Manager + Admin).
      "rent:view",
      "rent:create",
      "rent:update",
      "rent:pay",
      "rent:void",
      "rent:terminate",
      "rent:archive",
      "rent:export",
      "rent:sensitive_view",
      // `rent:override_terms` is intentionally NOT granted to the Asset Manager:
      // changing a schedule after money has been collected is an elevated act.
      "audit_campaign:view",
      "audit_campaign:scan",
      "reservation:view",
      "reservation:approve",
      "report:view",
      "report:export",
    ] as Permission[],
    isSystem: true,
  },
  user: {
    name: "Standard User",
    description: "View-only access with request capabilities",
    permissions: [
      "asset:view",
      "accessory:view",
      "license:view",
      "consumable:view",
      "component:view",
      "kit:view",
      "reservation:view",
      "reservation:create",
      "report:view",
      // Any signed-in employee may file their own house request; that request is
      // what places them in the House Queue. Closing someone else's request
      // stays with `house_request:manage` (Asset Manager / Admin only).
      "house_request:create",
      "house_request:view",
    ] as Permission[],
    isSystem: true,
  },
} as const;

/**
 * Get all permissions for a user, including admin override
 */
export async function getUserPermissions(
  userId: string,
): Promise<Set<Permission>> {
  const userWithRoles = await prisma.user.findUnique({
    where: { userid: userId },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!userWithRoles) {
    return new Set();
  }

  // Admin users get all permissions
  if (userWithRoles.isadmin) {
    return new Set(Object.keys(PERMISSIONS) as Permission[]);
  }

  const permissions = new Set<Permission>();

  userWithRoles.roles.forEach((userRole) => {
    userRole.role.permissions.forEach((perm) => {
      if (perm in PERMISSIONS) {
        permissions.add(perm as Permission);
      }
    });
  });

  return permissions;
}

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(
  userId: string,
  permission: Permission,
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.has(permission);
}

/**
 * Check if a user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissions: Permission[],
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId);
  return permissions.some((perm) => userPermissions.has(perm));
}

/**
 * Check if a user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissions: Permission[],
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId);
  return permissions.every((perm) => userPermissions.has(perm));
}

/**
 * Create a permission guard function
 */
export function createPermissionGuard(requiredPermissions: Permission[]) {
  return async (userId: string) => {
    return await hasAllPermissions(userId, requiredPermissions);
  };
}

/**
 * Get all available permissions as an array
 */
export function getAllPermissions(): {
  key: Permission;
  description: string;
}[] {
  return Object.entries(PERMISSIONS).map(([key, description]) => ({
    key: key as Permission,
    description,
  }));
}
