import type { ScreenContext } from "./prompts";

/**
 * Route → human label, so the assistant knows what screen a question came from.
 *
 * The label matters more than the path. "User is on /house-queue" is a string
 * the model has to interpret; "User is looking at the house queue" is not. A
 * handful of routes covering the bulk of the traffic is enough — anything
 * unrecognised falls back to a readable form of the path itself, which is still
 * better than nothing.
 */
const ROUTE_LABELS: { test: RegExp; label: string; recordType?: string }[] = [
  { test: /^\/dashboard/, label: "Dashboard" },
  { test: /^\/house-queue/, label: "House queue" },
  { test: /^\/household/, label: "House register" },
  { test: /^\/houses\/inspections/, label: "Handback inspections" },
  { test: /^\/houses\/allocated/, label: "Allocated houses" },
  { test: /^\/houses/, label: "Houses" },
  { test: /^\/assets\/[^/]+\/edit/, label: "Asset record · edit" },
  { test: /^\/assets\/[^/]+/, label: "Asset record", recordType: "asset" },
  { test: /^\/assets\/create/, label: "New asset" },
  { test: /^\/assets/, label: "Asset register" },
  { test: /^\/general-asset/, label: "General assets" },
  { test: /^\/consumables/, label: "Consumables" },
  { test: /^\/licences/, label: "Licences" },
  { test: /^\/kits/, label: "Kits" },
  { test: /^\/(user|admin)\/tickets/, label: "Tickets" },
  { test: /^\/maintenance/, label: "Maintenance" },
  { test: /^\/procurement/, label: "Procurement" },
  { test: /^\/suppliers/, label: "Suppliers" },
  { test: /^\/tco/, label: "Total cost of ownership" },
  { test: /^\/employees/, label: "Employees" },
  { test: /^\/approvals/, label: "Approvals" },
  { test: /^\/audits/, label: "Audits" },
  { test: /^\/duplicates/, label: "Duplicate records" },
  { test: /^\/locations/, label: "Locations" },
  { test: /^\/manufacturers/, label: "Manufacturers" },
  { test: /^\/models/, label: "Asset models" },
  { test: /^\/components/, label: "Components" },
  { test: /^\/accessories/, label: "Accessories" },
  { test: /^\/reservations/, label: "Reservations" },
  { test: /^\/reports/, label: "Reports" },
  { test: /^\/import/, label: "Data import" },
  { test: /^\/register/, label: "House registration" },
  { test: /^\/search/, label: "Global search" },
  { test: /^\/admin/, label: "Administration" },
  { test: /^\/user/, label: "User settings" },
  { test: /^\/help/, label: "Help" },
];

/** Turn a slug into readable words: `house-queue` → `House queue`. */
function humanize(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? "Home";
  const text = last
    .replace(/[-_]+/g, " ")
    .replace(/\[|\]|\(|\)/g, "")
    .trim();
  if (!text) return "Home";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Build the screen hint for a route.
 *
 * Called on the client on every question. Cheap, synchronous, and total — it
 * never returns undefined for a real path, so the grounding is always on.
 */
export function describeScreen(pathname: string | null): ScreenContext {
  const path = pathname?.split("?")[0] ?? "/";
  const match = ROUTE_LABELS.find((rule) => rule.test.test(path));
  const recordId = extractRecordId(path);
  return {
    path,
    label: match?.label ?? humanize(path),
    recordType: match?.recordType,
    recordId,
  };
}

/**
 * Pull a record identifier out of a detail route.
 *
 * `/assets/clx123` → `clx123`, `/household/h-9` → `h-9`. Only for routes whose
 * second segment is genuinely a record id, which is why the list is explicit
 * rather than positional.
 */
const RECORD_ROUTES =
  /^\/(assets|household|houses|licences|employees|suppliers|models|locations|kits|maintenance)\/([^/]+)/;

function extractRecordId(path: string): string | undefined {
  const match = RECORD_ROUTES.exec(path);
  const segment = match?.[2];
  if (!segment) return undefined;
  // Route verbs, not ids.
  if (["create", "new", "edit", "scan"].includes(segment)) return undefined;
  return segment.slice(0, 80);
}

/** Stable fingerprint used in the answer cache key. */
export function screenFingerprint(screen?: ScreenContext): string | undefined {
  if (!screen) return undefined;
  return [screen.recordType, screen.recordId, screen.path, screen.label]
    .filter(Boolean)
    .join("/");
}
