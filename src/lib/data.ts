import prisma from "./prisma";
import { cached } from "./cache";
import { getOrganizationContext } from "./organization-context";
import { seedOfficialDepartments } from "./department-seed";
import { compareAssetCategoryNames } from "./utils";

/**
 * Build an org-scoped where clause for data queries.
 * Returns an empty filter when org context is unavailable — suitable for
 * reference data that is intentionally global (manufacturers, suppliers,
 * locations, categories, statuses, models).
 */
async function orgWhere(): Promise<Record<string, unknown>> {
  try {
    const ctx = await getOrganizationContext();
    const orgId = ctx?.organization?.id;
    if (!orgId) return {};
    return { organizationId: orgId };
  } catch {
    // Outside of a request context (e.g., scripts) — no scoping
    return {};
  }
}

/**
 * Strict org-scoped where clause — throws when org context is missing.
 * Use this for entity data that MUST be scoped to the user's organization
 * (assets, accessories, consumables, licences, users, components, kits,
 * audit campaigns, etc.).
 */
async function strictOrgWhere(): Promise<{ organizationId: string }> {
  const ctx = await getOrganizationContext();
  const orgId = ctx?.organization?.id;
  if (!orgId) {
    throw new Error("Organization context required");
  }
  return { organizationId: orgId };
}

export async function getAssetCount() {
  const where = await strictOrgWhere();
  const key = `asset_count:${JSON.stringify(where)}`;
  return cached(key, () => prisma.asset.count({ where }), 2 * 60 * 1000);
}

export interface MapLocation {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  assetCount: number;
}

/**
 * Locations that have geo-coordinates plus their aggregate asset counts
 * (including children and grandchildren). Cached because this is the heaviest
 * query on the dashboard — a 3-level recursive asset count — and previously ran
 * uncached on every dashboard render.
 */
export async function getMapLocations(): Promise<MapLocation[]> {
  return cached(
    "map_locations",
    async () => {
      const locationsWithCoords = await prisma.location.findMany({
        where: { latitude: { not: null }, longitude: { not: null } },
        select: {
          locationid: true,
          locationname: true,
          latitude: true,
          longitude: true,
          _count: { select: { asset: true } },
          children: {
            select: {
              _count: { select: { asset: true } },
              children: {
                select: { _count: { select: { asset: true } } },
              },
            },
          },
        },
      });
      return locationsWithCoords.map((loc) => {
        let total = loc._count.asset;
        for (const child of loc.children) {
          total += child._count.asset;
          for (const grandchild of child.children) {
            total += grandchild._count.asset;
          }
        }
        return {
          id: loc.locationid,
          name: loc.locationname,
          latitude: loc.latitude!,
          longitude: loc.longitude!,
          assetCount: total,
        };
      });
    },
    2 * 60 * 1000,
  );
}

export async function getUserCount() {
  const where = await strictOrgWhere();
  const key = `user_count:${JSON.stringify(where)}`;
  return cached(key, () => prisma.user.count({ where }), 2 * 60 * 1000);
}

export async function getAccessoryCount() {
  const where = await strictOrgWhere();
  const key = `accessory_count:${JSON.stringify(where)}`;
  return cached(key, () => prisma.accessories.count({ where }), 2 * 60 * 1000);
}

export async function getAccessoryStatusDistribution() {
  const where = await strictOrgWhere();
  const key = `accessory_status_distribution:${JSON.stringify(where)}`;
  return cached(
    key,
    async () => {
      const items = await prisma.accessories.groupBy({
        by: ["statustypeid"],
        where,
        _count: { accessorieid: true },
      });
      return items.map((a) => ({
        statustypeid: a.statustypeid,
        count: a._count.accessorieid,
      }));
    },
    2 * 60 * 1000,
  );
}

export async function getAssetStatusDistribution() {
  const where = await strictOrgWhere();
  const key = `asset_status_distribution:${JSON.stringify(where)}`;
  return cached(
    key,
    async () => {
      const assets = await prisma.asset.groupBy({
        by: ["statustypeid"],
        where,
        _count: { assetid: true },
      });
      return assets.map((a) => ({
        statustypeid: a.statustypeid,
        count: a._count.assetid,
      }));
    },
    2 * 60 * 1000,
  );
}

export async function getUsers() {
  const where = await strictOrgWhere();
  const key = `users:${JSON.stringify(where)}`;
  return cached(
    key,
    () =>
      prisma.user.findMany({
        where,
        select: {
          userid: true,
          username: true,
          firstname: true,
          lastname: true,
          email: true,
          isadmin: true,
          canrequest: true,
          lan: true,
          creation_date: true,
          change_date: true,
          organizationId: true,
        },
      }),
    2 * 60 * 1000,
  );
}

export async function getAssets() {
  const where = await strictOrgWhere();
  const key = `assets_all:${JSON.stringify(where)}`;
  return cached(key, () => prisma.asset.findMany({ where }), 2 * 60 * 1000);
}

export async function getAssetById(id: string) {
  // Validate the id parameter
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const asset = await prisma.asset.findUnique({
    where: {
      assetid: id, // Ensure id is converted to an integer if required
    },
  });

  if (!asset) {
    throw new Error(`Asset with ID ${id} not found`);
  }

  return asset;
}

export async function getLocation() {
  return cached(
    "locations",
    () =>
      prisma.location.findMany({
        include: {
          parent: { select: { locationid: true, locationname: true } },
          children: { select: { locationid: true, locationname: true } },
        },
      }),
    2 * 60 * 1000,
  );
}

export async function getLocationById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const location = await prisma.location.findUnique({
    where: {
      locationid: id,
    },
    include: {
      parent: { select: { locationid: true, locationname: true } },
      children: { select: { locationid: true, locationname: true } },
    },
  });
  if (!location) {
    throw new Error(`Location with ID ${id} not found`);
  }
  return location;
}

export async function getStatus() {
  return cached(
    "status_types",
    () => prisma.statusType.findMany({}),
    2 * 60 * 1000,
  );
}

export async function getManufacturers() {
  return cached(
    "manufacturers",
    () => prisma.manufacturer.findMany({}),
    2 * 60 * 1000,
  );
}

export async function getManufacturerById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const manufacturer = await prisma.manufacturer.findUnique({
    where: { manufacturerid: id },
  });

  if (!manufacturer) {
    throw new Error(`Manufacturer with ID ${id} not found`);
  }

  return manufacturer;
}

export async function getAccessories() {
  const where = await strictOrgWhere();
  const key = `accessories_all:${JSON.stringify(where)}`;
  return cached(
    key,
    () => prisma.accessories.findMany({ where }),
    2 * 60 * 1000,
  );
}

export async function getAccessoryById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const accessory = await prisma.accessories.findUnique({
    where: { accessorieid: id },
  });

  if (!accessory) {
    throw new Error(`Accessory with ID ${id} not found`);
  }

  return accessory;
}

export async function getSuppliers() {
  return cached("suppliers", () => prisma.supplier.findMany({}), 2 * 60 * 1000);
}

export async function getSupplierById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const supplier = await prisma.supplier.findUnique({
    where: { supplierid: id },
  });

  if (!supplier) {
    throw new Error(`Supplier with ID ${id} not found`);
  }

  return supplier;
}

export async function getConsumables() {
  const where = await strictOrgWhere();
  const key = `consumables_all:${JSON.stringify(where)}`;
  return cached(
    key,
    () => prisma.consumable.findMany({ where }),
    2 * 60 * 1000,
  );
}

export async function getConsumableById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const consumable = await prisma.consumable.findUnique({
    where: { consumableid: id },
  });

  if (!consumable) {
    throw new Error(`Consumable with ID ${id} not found`);
  }

  return consumable;
}

export async function getConsumableCategories() {
  return cached(
    "consumable_categories",
    () => prisma.consumableCategoryType.findMany({}),
    2 * 60 * 1000,
  );
}

export async function getAccessoryCategories() {
  return cached(
    "accessory_categories",
    () => prisma.accessorieCategoryType.findMany({}),
    2 * 60 * 1000,
  );
}

export async function getLicences() {
  const where = await strictOrgWhere();
  const key = `licences_all:${JSON.stringify(where)}`;
  return cached(key, () => prisma.licence.findMany({ where }), 2 * 60 * 1000);
}

export async function getLicenceById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const licence = await prisma.licence.findUnique({
    where: { licenceid: id },
  });

  if (!licence) {
    throw new Error(`Licence with ID ${id} not found`);
  }

  return licence;
}

export async function getLicenceCategories() {
  return cached(
    "licence_categories",
    () => prisma.licenceCategoryType.findMany({}),
    2 * 60 * 1000,
  );
}

export async function getModel() {
  return cached("models", () => prisma.model.findMany({}), 2 * 60 * 1000);
}

export async function getCategories() {
  return cached(
    "categories",
    async () => {
      const items = await prisma.assetCategoryType.findMany({});
      return items.sort((a, b) =>
        compareAssetCategoryNames(
          a.assetcategorytypename,
          b.assetcategorytypename,
        ),
      );
    },
    2 * 60 * 1000,
  );
}

export async function getUserAssets() {
  return cached(
    "user_assets_all",
    () =>
      prisma.userAssets.findMany({
        select: {
          userassetsid: true,
          userid: true,
          assetid: true,
          creation_date: true,
          change_date: true,
        },
      }),
    2 * 60 * 1000,
  );
}

export async function getUserAccessoires() {
  return cached(
    "user_accessoires_all",
    () =>
      prisma.userAccessoires.findMany({
        select: {
          useraccessoiresid: true,
          userid: true,
          accessorieid: true,
          creation_date: true,
          change_date: true,
        },
      }),
    2 * 60 * 1000,
  );
}

export async function updateUserAsset(user: string, asset: string) {
  // DEPRECATED SIGNATURE: update by userAssetsId and new userId
  const res = await prisma.userAssets.update({
    where: { userassetsid: user },
    data: { userid: asset, change_date: new Date() },
  });
  return res;
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: {
      userid: id,
    },
  });
  return user;
}

export async function updateUser(id: string, data: Record<string, unknown>) {
  const user = await prisma.user.update({
    where: {
      userid: id,
    },
    data,
  });
  return user;
}

export async function deleteUser(id: string) {
  await prisma.user.delete({
    where: { userid: id },
  });
}

// Category Type data functions
export async function getAssetCategoryById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const category = await prisma.assetCategoryType.findUnique({
    where: { assetcategorytypeid: id },
  });

  if (!category) {
    throw new Error(`Asset category with ID ${id} not found`);
  }

  return category;
}

export async function getAccessoryCategoryById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const category = await prisma.accessorieCategoryType.findUnique({
    where: { accessoriecategorytypeid: id },
  });

  if (!category) {
    throw new Error(`Accessory category with ID ${id} not found`);
  }

  return category;
}

export async function getConsumableCategoryById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const category = await prisma.consumableCategoryType.findUnique({
    where: { consumablecategorytypeid: id },
  });

  if (!category) {
    throw new Error(`Consumable category with ID ${id} not found`);
  }

  return category;
}

export async function getLicenceCategoryById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const category = await prisma.licenceCategoryType.findUnique({
    where: { licencecategorytypeid: id },
  });

  if (!category) {
    throw new Error(`Licence category with ID ${id} not found`);
  }

  return category;
}

export async function getModelById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const model = await prisma.model.findUnique({
    where: { modelid: id },
  });

  if (!model) {
    throw new Error(`Model with ID ${id} not found`);
  }

  return model;
}

// Component data functions
export async function getComponents() {
  const where = await strictOrgWhere();
  const key = `components_all:${JSON.stringify(where)}`;
  return cached(
    key,
    () =>
      prisma.component.findMany({
        where,
        include: {
          category: true,
          manufacturer: true,
          supplier: true,
          location: true,
        },
        orderBy: { name: "asc" },
      }),
    2 * 60 * 1000,
  );
}

export async function getComponentById(id: string) {
  if (!id) throw new Error("Invalid ID parameter");
  const component = await prisma.component.findUnique({
    where: { id },
    include: {
      category: true,
      manufacturer: true,
      supplier: true,
      location: true,
      checkouts: {
        orderBy: { checkedOutAt: "desc" },
        include: {
          asset: { select: { assetid: true, assetname: true, assettag: true } },
          checkedOutByUser: {
            select: { userid: true, firstname: true, lastname: true },
          },
        },
      },
    },
  });
  if (!component) throw new Error(`Component with ID ${id} not found`);
  return component;
}

export async function getComponentCategories() {
  return cached(
    "component_categories",
    () => prisma.componentCategory.findMany({ orderBy: { name: "asc" } }),
    2 * 60 * 1000,
  );
}

export async function getComponentCategoryById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const category = await prisma.componentCategory.findUnique({
    where: { id },
  });

  if (!category) {
    throw new Error(`Component category with ID ${id} not found`);
  }

  return category;
}

// Kits
export async function getKits() {
  const where = await strictOrgWhere();
  const key = `kits_all:${JSON.stringify(where)}`;
  return cached(
    key,
    () =>
      prisma.kit.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
    2 * 60 * 1000,
  );
}

export async function getKitById(id: string) {
  if (!id) throw new Error("Invalid ID parameter");
  const kit = await prisma.kit.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!kit) throw new Error(`Kit with ID ${id} not found`);
  return kit;
}

// Audit Campaigns
export async function getAuditCampaigns() {
  const where = await strictOrgWhere();
  const key = `audit_campaigns_all:${JSON.stringify(where)}`;
  return cached(
    key,
    () =>
      prisma.auditCampaign.findMany({
        where,
        include: {
          creator: {
            select: { userid: true, firstname: true, lastname: true },
          },
          _count: { select: { entries: true, auditors: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    2 * 60 * 1000,
  );
}

export async function getAuditCampaignById(id: string) {
  if (!id) throw new Error("Invalid ID parameter");
  const campaign = await prisma.auditCampaign.findUnique({
    where: { id },
    include: {
      creator: { select: { userid: true, firstname: true, lastname: true } },
      auditors: {
        include: {
          user: { select: { userid: true, firstname: true, lastname: true } },
        },
      },
      entries: {
        include: {
          asset: { select: { assetid: true, assetname: true, assettag: true } },
          auditor: {
            select: { userid: true, firstname: true, lastname: true },
          },
          location: { select: { locationid: true, locationname: true } },
        },
      },
    },
  });
  if (!campaign) throw new Error(`Audit campaign with ID ${id} not found`);
  return campaign;
}

export async function getStatusById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  const status = await prisma.statusType.findUnique({
    where: { statustypeid: id },
  });

  if (!status) {
    throw new Error(`Status with ID ${id} not found`);
  }

  return status;
}

/**
 * Fetch audit history for any entity type. Returns the most recent 50 entries
 * with user info, sorted newest-first.
 */
export async function getEntityHistory(entity: string, entityId: string) {
  return prisma.audit_logs.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: {
        select: {
          userid: true,
          username: true,
          firstname: true,
          lastname: true,
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Employee data functions
// ---------------------------------------------------------------------------

const employeeBaseSelect = {
  id: true,
  organizationId: true,
  userid: true,
  departmentId: true,
  managerId: true,
  employeeNumber: true,
  firstname: true,
  lastname: true,
  phone: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  city: true,
  state: true,
  country: true,
  postalCode: true,
  jobTitle: true,
  employmentType: true,
  employmentStatus: true,
  jobGrade: true,
  maritalStatus: true,
  nationalId: true,
  familySize: true,
  disabilityStatus: true,
  hireDate: true,
  terminationDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Live employees for the current organization.
 *
 * Soft-deleted (archived) employees are excluded: the rest of the application
 * resolves employees by active employment, and an archived record must not feed
 * housing, reporting or reporting widgets.
 */
export async function getEmployees() {
  const where = await strictOrgWhere();
  const key = `employees_all:${JSON.stringify(where)}`;
  return cached(
    key,
    () =>
      prisma.employee.findMany({
        where: { ...where, deletedAt: null },
        select: {
          ...employeeBaseSelect,
          manager: {
            select: { id: true, firstname: true, lastname: true },
          },
          department: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ lastname: "asc" }, { firstname: "asc" }],
      }),
    2 * 60 * 1000,
  );
}

export async function getEmployeeById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }

  // Must be org-scoped like every other read path here — an unscoped lookup
  // by primary key alone would resolve employees belonging to another tenant.
  const where = await strictOrgWhere();

  const employee = await prisma.employee.findFirst({
    where: { ...where, id, deletedAt: null },
    select: {
      ...employeeBaseSelect,
      manager: {
        select: { id: true, firstname: true, lastname: true },
      },
      department: {
        select: { id: true, name: true },
      },
    },
  });

  if (!employee) {
    throw new Error(`Employee with ID ${id} not found`);
  }
  return employee;
}

export async function getDepartments() {
  const where = await strictOrgWhere();
  const orgId = where.organizationId;

  // Lazy-load the official department master book into a fresh organization.
  // Departments are reference data seeded from the official MSF master list via
  // a controlled initialization process — never hardcoded on the frontend.
  if (orgId) {
    try {
      const existing = await prisma.department.count({ where });
      if (existing === 0) {
        await seedOfficialDepartments(orgId);
      }
    } catch (error) {
      // Seeding is best-effort on read paths; callers fall back to an empty list.
      if (process.env.NODE_ENV !== "test") {
        console.error("Failed to lazy-seed departments", error);
      }
    }
  }

  const key = `departments_org:${JSON.stringify(where)}`;
  return cached(
    key,
    () =>
      prisma.department.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { name: "asc" }],
      }),
    2 * 60 * 1000,
  );
}

export async function getDepartmentById(id: string) {
  if (!id) {
    throw new Error("Invalid ID parameter");
  }
  const department = await prisma.department.findUnique({ where: { id } });
  if (!department) {
    throw new Error(`Department with ID ${id} not found`);
  }
  return department;
}

export async function getHouseholds() {
  const where = await strictOrgWhere();
  return prisma.household.findMany({
    where,
    include: {
      location: {
        select: {
          locationid: true,
          locationname: true,
        },
      },
    },
    orderBy: { srNo: "asc" },
  });
}

export async function getHouseholdSummary() {
  const where = await strictOrgWhere();
  const [total, active, inactive, staff] = await Promise.all([
    prisma.household.count({ where }),
    prisma.household.count({ where: { ...where, status: "Active" } }),
    prisma.household.count({ where: { ...where, status: "Inactive" } }),
    prisma.household.count({ where: { ...where, houseType: "Staff" } }),
  ]);
  return { total, active, inactive, staff };
}

/**
 * House ids that are currently allocated through the House Queue decision
 * ledger. Companion to the Assigned / Unassigned stats on the register view so
 * occupancy reflects the live queue state instead of being hard-coded.
 */
export async function getAssignedHouseIds(): Promise<string[]> {
  const where = await strictOrgWhere();
  const allocations = await prisma.houseAllocation.findMany({
    where: { ...where, status: "allocated" },
    select: { householdId: true },
  });
  return allocations
    .map((allocation) => allocation.householdId)
    .filter((id): id is string => Boolean(id));
}

// ---------------------------------------------------------------------------
// General Asset data functions
// ---------------------------------------------------------------------------

const generalAssetSelect = {
  id: true,
  srNo: true,
  itemType: true,
  pid: true,
  category: true,
  locationId: true,
  locationName: true,
  condition: true,
  brand: true,
  reviewsDate: true,
  remark: true,
  organizationId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getGeneralAssets() {
  const where = await strictOrgWhere();
  const key = `general_assets_all:${JSON.stringify(where)}`;
  return cached(
    key,
    () =>
      prisma.generalAsset.findMany({
        where,
        select: generalAssetSelect,
        orderBy: { srNo: "asc" },
      }),
    2 * 60 * 1000,
  );
}

export async function getGeneralAssetById(id: string) {
  if (!id) throw new Error("Invalid ID parameter");

  const item = await prisma.generalAsset.findUnique({
    where: { id },
    select: {
      ...generalAssetSelect,
      location: {
        select: { locationid: true, locationname: true },
      },
    },
  });

  if (!item) throw new Error(`General asset with ID ${id} not found`);
  return item;
}

export async function getGeneralAssetSummary() {
  const where = await strictOrgWhere();
  const [total, underMaintenance, newItems, disposed] = await Promise.all([
    prisma.generalAsset.count({ where }),
    prisma.generalAsset.count({
      where: { ...where, condition: "Under Maintenance" },
    }),
    prisma.generalAsset.count({ where: { ...where, condition: "New" } }),
    prisma.generalAsset.count({ where: { ...where, condition: "Disposed" } }),
  ]);
  return { total, underMaintenance, newItems, disposed };
}

export async function getGeneralAssetConditionDistribution() {
  const where = await strictOrgWhere();
  const key = `general_asset_condition_distribution:${JSON.stringify(where)}`;
  return cached(
    key,
    async () => {
      const items = await prisma.generalAsset.groupBy({
        by: ["condition"],
        where,
        _count: { id: true },
      });
      return items.map((i) => ({
        condition: i.condition,
        count: i._count.id,
      }));
    },
    2 * 60 * 1000,
  );
}
