/**
 * Total Cost of Ownership (TCO) type definitions.
 *
 * TCO = Purchase Costs + Maintenance Costs + Licence Costs
 *
 * Licence costs are fleet-level only because licences do not have a
 * direct FK to assets (they are assigned to users via LicenceSeatAssignment).
 */

export interface TCOCategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  assetCount: number;
  purchaseCost: number;
  maintenanceCost: number;
  depreciationLoss: number;
  currentValue: number;
  totalCostOfOwnership: number; // purchaseCost + maintenanceCost
}

export interface TCOSummary {
  totalPurchaseCost: number;
  totalMaintenanceCost: number;
  totalDepreciationLoss: number;
  totalCurrentValue: number;
  totalLicenceCost: number;
  grandTotal: number; // purchaseCost + maintenanceCost + licenceCost
  byCategory: TCOCategoryBreakdown[];
}
