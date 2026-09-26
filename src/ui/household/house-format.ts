/**
 * Shared formatting helpers for the residential / house UI.
 *
 * These used to be copy-pasted in every household client component; centralize
 * so dates, scores and names render identically everywhere.
 */

// House categories + service-years arrive from the House Queue engine so the
// UI and the priority algorithm can never drift apart (single source of truth).
export {
  HOUSE_CATEGORIES,
  type HouseCategory,
} from "@/lib/house-queue/types";
export { calculateServiceYears as serviceYears } from "@/lib/house-queue/mcda";

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtScore(value: number | string | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(2);
}

export function fullName(
  item: { firstname: string; lastname?: string | null } | null | undefined,
) {
  if (!item) return "-";
  return `${item.firstname ?? ""}${item.lastname ? ` ${item.lastname}` : ""}`.trim() || "-";
}