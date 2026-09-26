import { describe, it, expect } from "vitest";
import {
  cellToText,
  parseFlexibleDate,
  parseBool,
  normalizeRef,
  buildReferenceLookup,
  referenceNames,
  autoMapAssetColumns,
  cleanColumnMapping,
  validateAssetImportRow,
  processAssetImportRows,
  buildAssetLookups,
  friendlyUniqueError,
  previewRequestSchema,
  assetImportRequestSchema,
  type ReferenceRecord,
  type AssetImportFieldId,
} from "@/lib/excel-import";

// ---------------------------------------------------------------------------
// cellToText
// ---------------------------------------------------------------------------

describe("cellToText", () => {
  it("returns empty string for null/undefined", () => {
    expect(cellToText(null)).toBe("");
    expect(cellToText(undefined as unknown as null)).toBe("");
  });

  it("converts a Date to YYYY-MM-DD", () => {
    const d = new Date(Date.UTC(2024, 0, 15)); // Jan 15 2024 UTC
    const result = cellToText(d);
    expect(result).toMatch(/^2024-01-15$/);
  });

  it("converts a rich-text object to plain text", () => {
    const rt = { richText: [{ text: "Hello " }, { text: "World" }] };
    expect(cellToText(rt as unknown as Date)).toBe("Hello World");
  });

  it("converts a formula result to string", () => {
    const f = { result: 42 };
    expect(cellToText(f as unknown as Date)).toBe("42");
  });

  it("converts a number to string", () => {
    expect(cellToText(123)).toBe("123");
    expect(cellToText(3.14)).toBe("3.14");
  });

  it("converts a string to string", () => {
    expect(cellToText("hello")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(cellToText("  hello  ")).toBe("hello");
  });

  it("converts boolean to string", () => {
    expect(cellToText(true)).toBe("true");
    expect(cellToText(false)).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// parseFlexibleDate
// ---------------------------------------------------------------------------

describe("parseFlexibleDate", () => {
  it("returns null for null/empty", () => {
    expect(parseFlexibleDate(null)).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate("  ")).toBeNull();
  });

  it("parses YYYY-MM-DD", () => {
    const d = parseFlexibleDate("2024-03-15");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(2); // March = 2
    expect(d!.getDate()).toBe(15);
  });

  it("parses M/D/YYYY", () => {
    const d = parseFlexibleDate("3/15/2024");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(15);
  });

  it("parses a Date object", () => {
    const original = new Date(2024, 5, 1);
    const result = parseFlexibleDate(original);
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(original.getTime());
  });

  it("parses Excel serial date number", () => {
    // 45400 is approximately mid-2024
    const d = parseFlexibleDate(45400);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it("rejects non-date numbers as serial", () => {
    // 99999 is too large, not a valid date serial
    const d = parseFlexibleDate(99999);
    // Should be null since 99999 > 80_000 limit
    expect(d).toBeNull();
  });

  it("parses named month format", () => {
    const d = parseFlexibleDate("January 15, 2024");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getDate()).toBe(15);
  });

  it("returns null for invalid string", () => {
    expect(parseFlexibleDate("not-a-date")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseBool
// ---------------------------------------------------------------------------

describe("parseBool", () => {
  it("returns null for null/empty", () => {
    expect(parseBool(null)).toBeNull();
    expect(parseBool("")).toBeNull();
  });

  it("parses true values", () => {
    expect(parseBool("true")).toBe(true);
    expect(parseBool("True")).toBe(true);
    expect(parseBool("yes")).toBe(true);
    expect(parseBool("y")).toBe(true);
    expect(parseBool("1")).toBe(true);
    expect(parseBool("active")).toBe(true);
    expect(parseBool("YES")).toBe(true);
  });

  it("parses false values", () => {
    expect(parseBool("false")).toBe(false);
    expect(parseBool("no")).toBe(false);
    expect(parseBool("n")).toBe(false);
    expect(parseBool("0")).toBe(false);
  });

  it("returns null for unrecognized values", () => {
    expect(parseBool("maybe")).toBeNull();
    expect(parseBool("abc")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeRef
// ---------------------------------------------------------------------------

describe("normalizeRef", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeRef("  Hello   World  ")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(normalizeRef("")).toBe("");
  });

  it("trims whitespace", () => {
    expect(normalizeRef("  Laptop  ")).toBe("laptop");
  });
});

// ---------------------------------------------------------------------------
// buildReferenceLookup / referenceNames
// ---------------------------------------------------------------------------

describe("buildReferenceLookup", () => {
  const records: ReferenceRecord[] = [
    { id: "uuid-1", name: "Laptop", code: "LAP" },
    { id: "uuid-2", name: "Desktop", code: "DES" },
    { id: "uuid-3", name: "  Tablet  ", code: null },
  ];

  it("maps normalized name to id", () => {
    const map = buildReferenceLookup(records);
    expect(map.get("laptop")).toBe("uuid-1");
    expect(map.get("desktop")).toBe("uuid-2");
    expect(map.get("tablet")).toBe("uuid-3");
  });

  it("maps normalized code to id", () => {
    const map = buildReferenceLookup(records);
    expect(map.get("lap")).toBe("uuid-1");
    expect(map.get("des")).toBe("uuid-2");
  });

  it("is case-insensitive via normalized lookup", () => {
    const map = buildReferenceLookup(records);
    // Consumer normalizes before lookup (normalizeRef lowercases + collapses whitespace)
    expect(map.get(normalizeRef("LAPTOP"))).toBe("uuid-1");
    expect(map.get(normalizeRef("Lap"))).toBe("uuid-1");
  });

  it("does not overwrite existing keys", () => {
    const map = buildReferenceLookup(records);
    // "Laptop" name key is set first; code "lap" is added second
    expect(map.get("laptop")).toBe("uuid-1");
    expect(map.get("lap")).toBe("uuid-1"); // code also works
  });
});

describe("referenceNames", () => {
  it("returns sorted names", () => {
    const records: ReferenceRecord[] = [
      { id: "1", name: "Zebra" },
      { id: "2", name: "Apple" },
      { id: "3", name: "" },
    ];
    expect(referenceNames(records)).toEqual(["Apple", "Zebra"]);
  });
});

// ---------------------------------------------------------------------------
// autoMapAssetColumns
// ---------------------------------------------------------------------------

describe("autoMapAssetColumns", () => {
  it("maps standard headers", () => {
    const headers = [
      "Sr. No.",
      "Asset Type",
      "PID (Asset ID)",
      "Condition",
      "Location",
      "Brand",
      "Review Date",
    ];
    const mapping = autoMapAssetColumns(headers);
    expect(mapping.srNo).toBe(0);
    expect(mapping.assetType).toBe(1);
    expect(mapping.pid).toBe(2);
    expect(mapping.condition).toBe(3);
    expect(mapping.location).toBe(4);
    expect(mapping.brand).toBe(5);
    expect(mapping.reviewDate).toBe(6);
  });

  it("handles alternative header names", () => {
    const headers = ["Category", "Serial Number", "Status", "Manufacturer"];
    const mapping = autoMapAssetColumns(headers);
    expect(mapping.assetType).toBe(0);
    expect(mapping.pid).toBe(1);
    expect(mapping.condition).toBe(2);
    expect(mapping.brand).toBe(3);
  });

  it("skips unrecognized headers", () => {
    const headers = ["Foo", "Bar", "Asset Type", "Baz"];
    const mapping = autoMapAssetColumns(headers);
    expect(mapping.assetType).toBe(2);
    expect(mapping.srNo).toBeUndefined();
  });

  it("is case-insensitive", () => {
    const headers = ["ASSET TYPE", "pid", "Condition"];
    const mapping = autoMapAssetColumns(headers);
    expect(mapping.assetType).toBe(0);
    expect(mapping.pid).toBe(1);
    expect(mapping.condition).toBe(2);
  });

  it("maps real-world asset survey headers via contains fallback", () => {
    const headers = [
      "Equipment Name",
      "Equipment No",
      "Tag No",
      "Category",
      "Location",
      "Condition",
      "Manufacturer",
      "Purchase Date",
      "Purchase Price",
      "Review Date",
    ];
    const mapping = autoMapAssetColumns(headers);
    expect(mapping.assetname).toBe(0);
    expect(mapping.pid).toBe(1);
    expect(mapping.assettag).toBe(2);
    expect(mapping.assetType).toBe(3);
    expect(mapping.location).toBe(4);
    expect(mapping.condition).toBe(5);
    expect(mapping.brand).toBe(6);
    expect(mapping.purchasedate).toBe(7);
    expect(mapping.purchaseprice).toBe(8);
    expect(mapping.reviewDate).toBe(9);
  });

  it("does not claim generic columns via contains fallback", () => {
    const headers = ["Foo", "Notes", "Baz"];
    const mapping = autoMapAssetColumns(headers);
    expect(mapping.notes).toBe(1);
    expect(mapping.srNo).toBeUndefined();
    expect(mapping.assetType).toBeUndefined();
    expect(mapping.pid).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cleanColumnMapping
// ---------------------------------------------------------------------------

describe("cleanColumnMapping", () => {
  it("removes invalid field ids", () => {
    const cleaned = cleanColumnMapping({ pid: 0, fakeField: 1 } as Record<string, number>, 5);
    expect(cleaned.pid).toBe(0);
    expect((cleaned as Record<string, unknown>).fakeField).toBeUndefined();
  });

  it("removes out-of-bounds column indices", () => {
    const cleaned = cleanColumnMapping({ pid: 10, assetType: 1 }, 5);
    expect(cleaned.pid).toBeUndefined();
    expect(cleaned.assetType).toBe(1);
  });

  it("keeps valid entries", () => {
    const cleaned = cleanColumnMapping(
      { pid: 0, assetType: 1, condition: 2 },
      5,
    );
    expect(cleaned.pid).toBe(0);
    expect(cleaned.assetType).toBe(1);
    expect(cleaned.condition).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// validateAssetImportRow
// ---------------------------------------------------------------------------

const defaultLookups = (() => {
  const categories: ReferenceRecord[] = [
    { id: "cat-1", name: "Laptop", code: "LAP" },
    { id: "cat-2", name: "Desktop", code: "DES" },
  ];
  const statuses: ReferenceRecord[] = [
    { id: "st-1", name: "Available", isDefault: true },
    { id: "st-2", name: "In Use" },
  ];
  const locations: ReferenceRecord[] = [
    { id: "loc-1", name: "Office A" },
    { id: "loc-2", name: "Warehouse B" },
  ];
  const manufacturers: ReferenceRecord[] = [
    { id: "mfr-1", name: "Dell" },
    { id: "mfr-2", name: "HP" },
  ];
  const departments: ReferenceRecord[] = [
    { id: "dept-1", name: "IT", code: "IT" },
    { id: "dept-2", name: "Finance", code: "FIN" },
  ];

  return buildAssetLookups(categories, statuses, locations, manufacturers, departments);
})();

function freshSeen() {
  return { pids: new Map<string, number>(), tags: new Map<string, number>() };
}

function makeRaw(overrides: Partial<Record<AssetImportFieldId, string>> = {}) {
  return {
    srNo: "",
    assetType: "",
    pid: "",
    condition: "",
    location: "",
    brand: "",
    reviewDate: "",
    assetname: "",
    assettag: "",
    purchaseprice: "",
    purchasedate: "",
    department: "",
    mobile: "",
    requestable: "",
    specs: "",
    notes: "",
    ...overrides,
  } as Record<AssetImportFieldId, string>;
}

describe("validateAssetImportRow", () => {
  it("validates a complete valid row", () => {
    const raw = makeRaw({
      pid: "AST-001",
      assetType: "Laptop",
      condition: "Available",
      location: "Office A",
      brand: "Dell",
      reviewDate: "2024-06-15",
      assetname: "My Laptop",
      assettag: "TAG-001",
    });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.row.pid).toBe("AST-001");
      expect(result.row.assetcategorytypeid).toBe("cat-1");
      expect(result.row.statustypeid).toBe("st-1");
      expect(result.row.locationid).toBe("loc-1");
      expect(result.row.manufacturerid).toBe("mfr-1");
      expect(result.row.assetname).toBe("My Laptop");
      expect(result.row.assettag).toBe("TAG-001");
    }
  });

  it("rejects empty PID", () => {
    const raw = makeRaw({ assetType: "Laptop", pid: "" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("PID");
  });

  it("rejects empty asset type", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("Asset Type");
  });

  it("rejects unknown asset type", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "UnknownType" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("UnknownType");
  });

  it("rejects unknown condition", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", condition: "MissingStatus" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("MissingStatus");
  });

  it("rejects unknown location", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", location: "Mars" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("Mars");
  });

  it("rejects unknown brand", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", brand: "Acme" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("Acme");
  });

  it("rejects duplicate PID in file", () => {
    const seen = freshSeen();
    seen.pids.set("AST-001", 2);
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop" });
    const result = validateAssetImportRow(raw, defaultLookups, seen, 3);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("Duplicate PID");
  });

  it("rejects duplicate tag in file", () => {
    const seen = freshSeen();
    seen.tags.set("TAG-001", 2);
    const raw = makeRaw({ pid: "AST-002", assetType: "Laptop", assettag: "TAG-001" });
    const result = validateAssetImportRow(raw, defaultLookups, seen, 3);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("Duplicate Tag");
  });

  it("defaults PID as assetname and assettag when not provided", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.row.assetname).toBe("AST-001");
      expect(result.row.assettag).toBe("AST-001");
    }
  });

  it("defaults to default status when condition is empty", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", condition: "" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.row.statustypeid).toBe("st-1");
  });

  it("resolves condition by code", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "LAP" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.row.assetcategorytypeid).toBe("cat-1");
  });

  it("accepts valid review date in ISO format", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", reviewDate: "2024-06-15" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.row.reviewsDate).not.toBeNull();
      expect(result.row.reviewsDate!.getFullYear()).toBe(2024);
    }
  });

  it("rejects invalid review date", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", reviewDate: "not-a-date" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("Review Date");
  });

  it("accepts valid purchase price", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", purchaseprice: "1234.56" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.row.purchaseprice).toBe(1234.56);
  });

  it("rejects negative purchase price", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", purchaseprice: "-100" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("Purchase Price");
  });

  it("parses boolean mobile/requestable", () => {
    const raw = makeRaw({
      pid: "AST-001",
      assetType: "Laptop",
      mobile: "yes",
      requestable: "no",
    });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.row.mobile).toBe(true);
      expect(result.row.requestable).toBe(false);
    }
  });

  it("rejects invalid boolean value", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop", mobile: "maybe" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error).toContain("Mobile");
  });

  it("accepts empty optional fields", () => {
    const raw = makeRaw({ pid: "AST-001", assetType: "Laptop" });
    const result = validateAssetImportRow(raw, defaultLookups, freshSeen(), 2);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.row.locationid).toBeNull();
      expect(result.row.manufacturerid).toBeNull();
      expect(result.row.departmentId).toBeNull();
      expect(result.row.reviewsDate).toBeNull();
      expect(result.row.purchaseprice).toBeNull();
      expect(result.row.mobile).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// processAssetImportRows (batch)
// ---------------------------------------------------------------------------

describe("processAssetImportRows", () => {
  const headers = ["Sr. No.", "Asset Type", "PID (Asset ID)", "Condition"];
  const rows = [
    headers,
    ["1", "Laptop", "AST-001", "Available"],
    ["2", "Laptop", "AST-002", "In Use"],
    ["3", "Desktop", "AST-003", "Available"],
  ];
  const mapping: Partial<Record<AssetImportFieldId, number>> = {
    srNo: 0,
    assetType: 1,
    pid: 2,
    condition: 3,
  };

  it("returns valid rows and no errors for clean data", () => {
    const result = processAssetImportRows(rows, 1, mapping, defaultLookups);
    expect(result.validRows).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("skips empty rows", () => {
    const rowsWithEmpty = [
      headers,
      ["1", "Laptop", "AST-001", "Available"],
      ["", "", "", ""],
      ["2", "Desktop", "AST-002", "In Use"],
    ];
    const result = processAssetImportRows(rowsWithEmpty, 1, mapping, defaultLookups);
    expect(result.validRows).toHaveLength(2);
  });

  it("detects duplicate PIDs within batch", () => {
    const rowsWithDup = [
      headers,
      ["1", "Laptop", "AST-001", "Available"],
      ["2", "Laptop", "AST-001", "In Use"], // duplicate PID
    ];
    const result = processAssetImportRows(rowsWithDup, 1, mapping, defaultLookups);
    expect(result.validRows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("Duplicate PID");
  });

  it("returns error when no data rows exist", () => {
    const result = processAssetImportRows([headers], 1, mapping, defaultLookups);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("No data rows");
  });
});

// ---------------------------------------------------------------------------
// friendlyUniqueError
// ---------------------------------------------------------------------------

describe("friendlyUniqueError", () => {
  it("identifies assettag violation", () => {
    const msg = friendlyUniqueError(
      new Error("Unique constraint failed on the fields: (`assettag`)"),
    );
    expect(msg).toContain("Tag already exists");
  });

  it("identifies serialnumber violation", () => {
    const msg = friendlyUniqueError(
      new Error("Unique constraint failed on the fields: (`serialnumber`)"),
    );
    expect(msg).toContain("PID (Asset ID) already exists");
  });

  it("returns generic message for other constraints", () => {
    const msg = friendlyUniqueError(new Error("Something else"));
    expect(msg).toContain("Something else");
  });

  it("handles non-Error inputs", () => {
    const msg = friendlyUniqueError("not an error");
    expect(msg).toContain("not an error");
  });
});

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

describe("previewRequestSchema", () => {
  it("accepts valid preview request", () => {
    const result = previewRequestSchema.parse({ headerRow: 1 });
    expect(result.headerRow).toBe(1);
    expect(result.columnMapping).toEqual({});
  });

  it("defaults headerRow to 1", () => {
    const result = previewRequestSchema.parse({});
    expect(result.headerRow).toBe(1);
  });

  it("rejects headerRow < 1", () => {
    expect(() => previewRequestSchema.parse({ headerRow: 0 })).toThrow();
  });
});

describe("assetImportRequestSchema", () => {
  // All 8 required columns must be present in the mapping
  const requiredMapping = {
    srNo: 0,
    assetType: 1,
    pid: 2,
    condition: 3,
    location: 4,
    brand: 5,
    reviewDate: 6,
    notes: 7,
  };

  it("accepts valid import request with all required columns", () => {
    const result = assetImportRequestSchema.parse({
      sheetName: "Sheet1",
      headerRow: 1,
      columnMapping: requiredMapping,
    });
    expect(result.sheetName).toBe("Sheet1");
  });

  it("rejects missing required columns", () => {
    expect(() =>
      assetImportRequestSchema.parse({
        sheetName: "Sheet1",
        headerRow: 1,
        columnMapping: { pid: 0, assetType: 1 },
      }),
    ).toThrow();
  });

  it("rejects missing sheetName", () => {
    expect(() =>
      assetImportRequestSchema.parse({
        headerRow: 1,
        columnMapping: requiredMapping,
      }),
    ).toThrow();
  });

  it("rejects negative column indices", () => {
    expect(() =>
      assetImportRequestSchema.parse({
        sheetName: "Sheet1",
        headerRow: 1,
        columnMapping: { ...requiredMapping, pid: -1 },
      }),
    ).toThrow();
  });
});
