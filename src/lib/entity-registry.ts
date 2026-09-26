/**
 * Central entity type registry.
 * Single source of truth for all inventory entity types.
 */

export interface EntityDefinition {
  key: string;
  label: string;
  pluralLabel: string;
  idField: string;
  nameField: string;
  detailPath: string;
  searchable: boolean;
  hasCustomFields: boolean;
  auditKey: string;
}

export const ENTITY_REGISTRY: Record<string, EntityDefinition> = {
  asset: {
    key: "asset",
    label: "Asset",
    pluralLabel: "Assets",
    idField: "assetid",
    nameField: "assetname",
    detailPath: "/assets/{id}",
    searchable: true,
    hasCustomFields: true,
    auditKey: "asset",
  },
  accessory: {
    key: "accessory",
    label: "Accessory",
    pluralLabel: "Accessories",
    idField: "accessorieid",
    nameField: "accessoriename",
    detailPath: "/accessories/{id}",
    searchable: true,
    hasCustomFields: true,
    auditKey: "accessory",
  },
  consumable: {
    key: "consumable",
    label: "Consumable",
    pluralLabel: "Consumables",
    idField: "consumableid",
    nameField: "consumablename",
    detailPath: "/consumables/{id}",
    searchable: true,
    hasCustomFields: true,
    auditKey: "consumable",
  },
  licence: {
    key: "licence",
    label: "Licence",
    pluralLabel: "Licences",
    idField: "licenceid",
    nameField: "licencekey",
    detailPath: "/licences/{id}",
    searchable: true,
    hasCustomFields: true,
    auditKey: "license",
  },
  component: {
    key: "component",
    label: "Component",
    pluralLabel: "Components",
    idField: "id",
    nameField: "name",
    detailPath: "/components/{id}",
    searchable: true,
    hasCustomFields: true,
    auditKey: "component",
  },
  kit: {
    key: "kit",
    label: "Kit",
    pluralLabel: "Kits",
    idField: "id",
    nameField: "name",
    detailPath: "/kits/{id}",
    searchable: false,
    hasCustomFields: true,
    auditKey: "kit",
  },
};

export function getEntitiesWithCustomFields(): EntityDefinition[] {
  return Object.values(ENTITY_REGISTRY).filter((e) => e.hasCustomFields);
}

export function getSearchableEntities(): EntityDefinition[] {
  return Object.values(ENTITY_REGISTRY).filter((e) => e.searchable);
}
