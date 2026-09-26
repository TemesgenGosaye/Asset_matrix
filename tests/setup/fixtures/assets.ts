export const mockAsset = {
  assetid: "asset-uuid-001",
  assetname: "MacBook Pro 16",
  assettag: "ASSET-001",
  serialnumber: "SN-ABC-123",
  purchaseprice: 2499.99,
  purchasedate: new Date("2025-06-15"),
  mobile: false,
  organizationId: "org-uuid-001",
  statusId: "status-uuid-001",
  modelId: null,
  manufacturerId: null,
  supplierId: null,
  locationId: null,
  change_date: new Date(),
};

export const mockAssetList = [
  mockAsset,
  {
    ...mockAsset,
    assetid: "asset-uuid-002",
    assetname: "Dell Monitor",
    assettag: "ASSET-002",
    serialnumber: "SN-DEF-456",
    purchaseprice: 599.99,
  },
];
