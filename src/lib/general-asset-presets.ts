/**
 * Client-safe presets for the General Asset module.
 * Kept free of any server-only imports (Prisma / pg) so they can be bundled
 * into client components without pulling the Postgres driver into the browser.
 */

export const GENERAL_ASSET_ITEM_TYPES = [
  "Machinery & Equipment",
  "Building & Structure",
  "Vehicle & Transport",
  "Furniture & Fixture",
  "Office Equipment",
  "Electrical Equipment",
  "Laboratory Equipment",
  "Agricultural Equipment",
  "Tools & Instruments",
  "Safety & Fire Equipment",
  "Other",
] as const;

export const GENERAL_ASSET_CONDITIONS = [
  "New",
  "Good",
  "Fair",
  "Poor",
  "Under Maintenance",
  "Disposed",
] as const;

export const GENERAL_ASSET_CONDITION_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  New: { label: "New", variant: "default" },
  Good: { label: "Good", variant: "secondary" },
  Fair: { label: "Fair", variant: "outline" },
  Poor: { label: "Poor", variant: "destructive" },
  "Under Maintenance": { label: "Under Maintenance", variant: "outline" },
  Disposed: { label: "Disposed", variant: "destructive" },
};

export type GeneralAssetConditionKey = (typeof GENERAL_ASSET_CONDITIONS)[number];