export const CANONICAL_ASSET_COLUMNS = [
  { key: "serialNo", header: "S/N0", group: null },
  { key: "assetname", header: "Description", group: null },
  { key: "serialnumber", header: "Property No", group: null },
  { key: "department", header: "Dept", group: null },
  { key: "financeNo", header: "Finance No", group: null },
  { key: "condition1", header: "Condition (1st)", group: "1st Review" },
  { key: "location1", header: "Location (1st)", group: "1st Review" },
  { key: "reviewDate1", header: "Review Date (1st)", group: "1st Review" },
  { key: "condition2", header: "Condition (2nd)", group: "2nd Review" },
  { key: "location2", header: "Location (2nd)", group: "2nd Review" },
  { key: "reviewDate2", header: "Review Date (2nd)", group: "2nd Review" },
] as const;

export type CanonicalAssetColumnKey =
  (typeof CANONICAL_ASSET_COLUMNS)[number]["key"];

export type CanonicalAssetHeader =
  (typeof CANONICAL_ASSET_COLUMNS)[number]["header"];

export const CANONICAL_ASSET_HEADERS = [
  "S/N0",
  "Description",
  "Property No",
  "Dept",
  "Finance No",
  "Condition (1st)",
  "Location (1st)",
  "Review Date (1st)",
  "Condition (2nd)",
  "Location (2nd)",
  "Review Date (2nd)",
] as const satisfies readonly CanonicalAssetHeader[];

export const OPTIONAL_ASSET_COLUMNS = [
  { key: "categoryCode", header: "Category Code" },
  { key: "additionalData", header: "Additional Data" },
  { key: "sourceRow", header: "Source Row" },
  { key: "hiddenInSource", header: "Hidden in Source" },
] as const;

export type OptionalAssetColumnKey =
  (typeof OPTIONAL_ASSET_COLUMNS)[number]["key"];

export interface CanonicalAssetSource {
  serialNo?: string | null;
  assetname?: string | null;
  serialnumber?: string | null;
  sourceDepartment?: string | null;
  departmentCode?: string | null;
  department?: { name?: string | null } | null;
  financeNo?: string | null;
  financeNo1?: string | null;
  financeNo2?: string | null;
  condition1?: string | null;
  condition1Raw?: string | null;
  condition1Status?: { statustypename?: string | null } | null;
  location1?: string | null;
  location1Rel?: { locationname?: string | null } | null;
  reviewDate1?: string | Date | null;
  condition2Raw?: string | null;
  statusType?: { statustypename?: string | null } | null;
  location2Raw?: string | null;
  location?: { locationname?: string | null } | null;
  reviewsDate?: string | Date | null;
  categoryCode?: string | null;
  additionalData?: string | null;
  sourceRow?: number | null;
  hiddenInSource?: boolean | null;
}

export type CanonicalAssetValue = string | number | boolean | Date | null;

export function firstNonBlank(
  ...values: (string | null | undefined)[]
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function resolveFinanceNo(
  asset: Pick<CanonicalAssetSource, "financeNo" | "financeNo1" | "financeNo2">,
): string | null {
  if (typeof asset.financeNo === "string" && asset.financeNo.trim()) {
    return asset.financeNo;
  }
  return firstNonBlank(asset.financeNo2, asset.financeNo1);
}

export function getCanonicalAssetValue(
  asset: CanonicalAssetSource,
  key: CanonicalAssetColumnKey | OptionalAssetColumnKey,
): CanonicalAssetValue {
  switch (key) {
    case "serialNo":
      return asset.serialNo ?? null;
    case "assetname":
      return asset.assetname ?? null;
    case "serialnumber":
      return asset.serialnumber ?? null;
    case "department":
      return (
        firstNonBlank(
          asset.sourceDepartment,
          asset.department?.name ?? null,
          asset.departmentCode,
        ) ?? null
      );
    case "financeNo":
      return resolveFinanceNo(asset);
    case "condition1":
      return (
        firstNonBlank(
          asset.condition1Status?.statustypename ?? null,
          asset.condition1,
          asset.condition1Raw,
        ) ?? null
      );
    case "location1":
      return (
        firstNonBlank(
          asset.location1Rel?.locationname ?? null,
          asset.location1,
        ) ?? null
      );
    case "reviewDate1":
      return asset.reviewDate1 ?? null;
    case "condition2":
      return (
        firstNonBlank(
          asset.statusType?.statustypename ?? null,
          asset.condition2Raw,
        ) ?? null
      );
    case "location2":
      return (
        firstNonBlank(
          asset.location?.locationname ?? null,
          asset.location2Raw,
        ) ?? null
      );
    case "reviewDate2":
      return asset.reviewsDate ?? null;
    case "categoryCode":
      return asset.categoryCode ?? null;
    case "additionalData":
      return asset.additionalData ?? null;
    case "sourceRow":
      return asset.sourceRow ?? null;
    case "hiddenInSource":
      return asset.hiddenInSource ?? null;
  }
}
