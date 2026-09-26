import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Serial-number pattern detection helpers
// ---------------------------------------------------------------------------

interface ManufacturerDetection {
  manufacturer: string;
  confidence: "high" | "medium" | "low";
}

interface AppleSerialDecoded {
  manufacturer: "Apple";
  factoryCode: string;
  manufactureDateCode: string;
  modelCode: string;
}

/**
 * Decode a 12-character Apple serial number into its constituent parts.
 * Characters 1-3  = factory code
 * Characters 4-8  = manufacturing date (encoded)
 * Characters 9-12 = model identifier
 */
function decodeAppleSerial(serial: string): AppleSerialDecoded | null {
  if (serial.length !== 12) return null;
  if (!/^[A-Z0-9]{12}$/i.test(serial)) return null;
  return {
    manufacturer: "Apple",
    factoryCode: serial.slice(0, 3),
    manufactureDateCode: serial.slice(3, 8),
    modelCode: serial.slice(8, 12),
  };
}

/**
 * Known Apple factory prefixes (non-exhaustive) – used to boost confidence
 * when the serial also matches Apple length constraints.
 */
const APPLE_FACTORY_PREFIXES = [
  "C02",
  "C07",
  "C17",
  "C1M",
  "C2Q",
  "CK",
  "D25",
  "DL",
  "DM",
  "DN",
  "DY",
  "F17",
  "F18",
  "F5K",
  "F5V",
  "FCM",
  "FK",
  "FM",
  "G8W",
  "GQ",
  "QP",
  "RN",
  "VM",
  "W80",
  "W88",
  "W89",
  "YM",
];

/**
 * Known Lenovo serial-number prefixes.
 */
const LENOVO_PREFIXES = ["PF", "MP", "MJ", "PB", "PC", "R9", "S4", "W1", "LR"];

/**
 * Attempt to identify the device manufacturer from the serial-number pattern.
 */
function detectManufacturer(serial: string): ManufacturerDetection | null {
  const upper = serial.toUpperCase();

  // ---- Apple ---------------------------------------------------------------
  // 12-char serials with a known factory prefix → high confidence
  if (/^[A-Z0-9]{12}$/.test(upper)) {
    const prefix3 = upper.slice(0, 3);
    const prefix2 = upper.slice(0, 2);
    if (
      APPLE_FACTORY_PREFIXES.includes(prefix3) ||
      APPLE_FACTORY_PREFIXES.includes(prefix2)
    ) {
      return { manufacturer: "Apple", confidence: "high" };
    }
    // Generic 12-char alphanumeric is still likely Apple
    return { manufacturer: "Apple", confidence: "medium" };
  }
  // 10-11 char alphanumeric (older Apple serials)
  if (/^[A-Z0-9]{10,11}$/.test(upper) && /[A-Z]/.test(upper)) {
    return { manufacturer: "Apple", confidence: "medium" };
  }

  // ---- Dell Service Tag ----------------------------------------------------
  // Exactly 7 chars, alphanumeric but never uses O, I, or 0
  if (/^[A-HJ-NP-Z1-9]{7}$/.test(upper)) {
    return { manufacturer: "Dell", confidence: "medium" };
  }

  // ---- Lenovo --------------------------------------------------------------
  // Starts with a known 2-char prefix followed by alphanumeric chars
  if (/^[A-Z0-9]{8,14}$/.test(upper)) {
    const prefix2 = upper.slice(0, 2);
    if (LENOVO_PREFIXES.includes(prefix2)) {
      return { manufacturer: "Lenovo", confidence: "low" };
    }
  }

  return null;
}

/**
 * Infer a likely device category based on serial-number characteristics.
 * This is a rough heuristic – it cannot replace manual classification.
 */
function suggestCategory(manufacturer: string, serial: string): string | null {
  if (manufacturer === "Apple") {
    const upper = serial.toUpperCase();
    // iPhones historically have shorter serials or specific model codes
    // For 12-char serials, last 4 chars encode the model
    if (upper.length === 12) {
      const modelCode = upper.slice(8, 12);
      // Common MacBook/iMac model-code patterns (non-exhaustive)
      // Model codes starting with specific letters often correlate to laptops
      // Without a full lookup table we return "Laptop" as the most common IT asset
      return "Laptop";
    }
    return "Laptop";
  }
  if (manufacturer === "Dell") {
    return "Laptop";
  }
  if (manufacturer === "Lenovo") {
    return "Laptop";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

// GET /api/asset/lookup-serial?serial=XXXXX
export async function GET(req: NextRequest) {
  try {
    await requireApiAuth();

    const serial = req.nextUrl.searchParams.get("serial");
    if (!serial || serial.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing required query parameter: serial" },
        { status: 400 },
      );
    }

    const trimmed = serial.trim();
    const detection = detectManufacturer(trimmed);

    if (!detection) {
      return NextResponse.json(
        {
          detected: false,
          manufacturer: null,
          confidence: null,
          suggestions: null,
        },
        { status: 200 },
      );
    }

    const appleDetails =
      detection.manufacturer === "Apple" ? decodeAppleSerial(trimmed) : null;

    const category = suggestCategory(detection.manufacturer, trimmed);

    return NextResponse.json(
      {
        detected: true,
        manufacturer: detection.manufacturer,
        confidence: detection.confidence,
        suggestions: {
          category,
        },
        ...(appleDetails
          ? {
              appleDecoded: {
                factoryCode: appleDetails.factoryCode,
                manufactureDateCode: appleDetails.manufactureDateCode,
                modelCode: appleDetails.modelCode,
              },
            }
          : {}),
      },
      { status: 200 },
    );
  } catch (e) {
    logger.error("GET /api/asset/lookup-serial error", { error: e });
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Serial lookup failed" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
