export interface RegisterAsset {
  assetid: string;
  assetname: string;
  assetnameRaw?: string | null;
  serialnumber: string;
  assettag: string;
  statustypeid?: string | null;
  locationid?: string | null;
  departmentId?: string | null;
  departmentCode?: string | null;
  organizationId?: string | null;
  assetcategorytypeid?: string | null;
  manufacturerid?: string | null;
  modelid?: string | null;
  supplierid?: string | null;
  specs?: string | null;
  purchaseprice?: number | null;
  warrantyMonths?: number | null;
  mobile?: boolean | null;
  requestable?: boolean | null;
  sourceDepartment?: string | null;
  categoryCode?: string | null;
  serialNo?: string | null;
  condition1?: string | null;
  condition1Raw?: string | null;
  financeNo?: string | null;
  location1?: string | null;
  location2Raw?: string | null;
  reviewDate1?: string | null;
  reviewsDate?: string | null;
  additionalData?: string | null;
  sourceRow?: number | null;
  hiddenInSource?: boolean;
  reviewDate1Ambiguous?: boolean;
  reviewDate2Ambiguous?: boolean;
  department?: { name: string } | null;
  statusType?: { statustypename: string } | null;
  location?: { locationname: string } | null;
  assetCategoryType?: { assetcategorytypename: string } | null;
}

export interface ReferenceItem {
  id: string;
  name: string;
  code?: string | null;
  color?: string | null;
}

export type AssetOperationType =
  | "assign"
  | "transfer"
  | "checkout"
  | "reserve"
  | "status"
  | "qrcode"
  | "label"
  | "delete";

export interface ActiveAssetOperation {
  asset: RegisterAsset;
  type: AssetOperationType;
}
