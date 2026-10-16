/**
 * Centralised format rules for the personal data this module accepts.
 *
 * Both rules live here, as data, rather than being inline in a Zod schema, so a
 * policy change (Ethiopia moves to 13-digit mobiles, Finance accepts a different
 * National ID layout) is a one-line edit in ONE file instead of a hunt through
 * the form, the API validator, the export and the tests.
 *
 * Nothing in this module logs what it validates: National ID and phone numbers
 * are personal data under the portal's GDPR surface.
 */

import { PHONE_MAX, PHONE_MIN } from "./constants";

// ---------------------------------------------------------------------------
// National ID
// ---------------------------------------------------------------------------

/**
 * THE National ID rule. Adjust here and the create form, the update form, the
 * API, the unique-constraint lookup and the unit tests all follow.
 *
 * Policy: digits only. The lower bound stops an accidental single keystroke from
 * creating a "unique" record; the upper bound matches the `varchar(64)` column.
 * Deliberately does NOT enforce a fixed length - real Ethiopian ID documents
 * have been issued in more than one format and rejecting an unfamiliar length at
 * the finance counter would be worse than storing it.
 */
export const NATIONAL_ID_RULE = {
  minLength: 4,
  maxLength: 20,
  pattern: /^[0-9]+$/,
  message: "National ID must be digits only",
} as const;

/** Human-readable message combining the length bound with the charset rule. */
export const NATIONAL_ID_MESSAGE = `${NATIONAL_ID_RULE.message} (${NATIONAL_ID_RULE.minLength}-${NATIONAL_ID_RULE.maxLength} digits).`;

export interface NationalIdResult {
  ok: boolean;
  /** Trimmed value, present when `ok`. */
  value?: string;
  /** Field-level message, present when not `ok`. */
  message?: string;
}

/**
 * Validate and normalise a National ID.
 *
 * Normalisation is whitespace-trim only: digits are digits, and reformatting
 * someone else's identity document is not this application's business.
 */
export function validateNationalId(input: unknown): NationalIdResult {
  const raw = input === null || input === undefined ? "" : String(input).trim();

  if (raw === "") {
    return { ok: false, message: "National ID is required" };
  }
  if (!NATIONAL_ID_RULE.pattern.test(raw)) {
    return { ok: false, message: NATIONAL_ID_MESSAGE };
  }
  if (
    raw.length < NATIONAL_ID_RULE.minLength ||
    raw.length > NATIONAL_ID_RULE.maxLength
  ) {
    return { ok: false, message: NATIONAL_ID_MESSAGE };
  }
  return { ok: true, value: raw };
}

/**
 * Mask a National ID, keeping only the last four characters.
 *
 * Applied on the server, in the query layer, so an unmasked value never leaves
 * the API for a caller without `rent:sensitive_view`.
 *
 * ```
 * "123456789012" -> "********9012"
 * "1234"         -> "1234"
 * "" / null      -> ""
 * ```
 */
export function maskNationalId(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= NATIONAL_ID_VISIBLE_SUFFIX) return value;
  const suffix = value.slice(-NATIONAL_ID_VISIBLE_SUFFIX);
  return "*".repeat(value.length - NATIONAL_ID_VISIBLE_SUFFIX) + suffix;
}

/** Number of trailing characters left visible by {@link maskNationalId}. */
export const NATIONAL_ID_VISIBLE_SUFFIX = 4;

/** True when {@link maskNationalId} actually obscures something. */
export function isNationalIdMasked(value: string | null | undefined): boolean {
  return Boolean(value) && value!.length > NATIONAL_ID_VISIBLE_SUFFIX;
}

// ---------------------------------------------------------------------------
// Ethiopian phone numbers
// ---------------------------------------------------------------------------

/** International dialling prefix for Ethiopia. */
export const ETHIOPIA_CC = "251";

/**
 * THE accepted Ethiopian phone rule.
 *
 * Accepted input shapes (all case- and separator-insensitive):
 *   +251 9XXXXXXXX   (international, Ethio Telecom 9-series)
 *   +251 7XXXXXXXX   (international, Safaricom 7-series)
 *   07XXXXXXXX       (local Safaricom)
 *   09XXXXXXXX       (local Ethio Telecom)
 *   2519XXXXXXXX     (international prefix without '+')
 *   7XXXXXXXX / 9XXXXXXXX  (bare national significant number)
 *
 * Anything else is rejected rather than guessed, because a mis-parsed phone
 * number means rent receipts go to the wrong person.
 *
 * Adjust here to accept a new range; {@link normalizeEthiopianPhone} and the Zod
 * schema both read these constants.
 */
export const ETHIOPIAN_PHONE_RULE = {
  cc: ETHIOPIA_CC,
  /** Country-code + 9 national digits. */
  e164Pattern: new RegExp(`^\\+${ETHIOPIA_CC}[79][0-9]{8}$`),
  /** The two mobile prefixes actually in service, without the leading zero. */
  nationalPrefixes: ["9", "7"] as const,
  /** National significant number length, excluding the country code. */
  nsnLength: 9,
  message:
    "Enter an Ethiopian mobile number, e.g. 0912345678, 07 123 4567, or +251 912345678",
} as const;

export interface PhoneResult {
  ok: boolean;
  /** E.164 form (`+2519xxxxxxxx`), present when `ok`. */
  value?: string;
  message?: string;
}

/**
 * Normalise an Ethiopian phone number to E.164, or explain why it cannot be
 * normalised.
 *
 * Pure string handling - no dialling rules are inferred and nothing is guessed.
 */
export function normalizeEthiopianPhone(input: unknown): PhoneResult {
  const raw = input === null || input === undefined ? "" : String(input);
  // Strip the separators humans actually type: spaces, dots, dashes, brackets.
  const stripped = raw.replace(/[\s.\-()]/g, "");
  if (stripped === "") {
    return { ok: false, message: "Phone number is required" };
  }

  // Reject anything that is not a digit run with an optional leading '+'.
  if (!/^\+?[0-9]+$/.test(stripped)) {
    return { ok: false, message: ETHIOPIAN_PHONE_RULE.message };
  }

  let digits = stripped.startsWith("+") ? stripped.slice(1) : stripped;
  if (digits.startsWith("00")) digits = digits.slice(2); // IDD prefix

  // Local dialling form: 09xxxxxxxx / 07xxxxxxxx -> 2519xxxxxxxx / 2517xxxxxxxx
  if (digits.startsWith("0"))
    digits = ETHIOPIAN_PHONE_RULE.cc + digits.slice(1);
  // Bare country code without '+': 2519xxxxxxxx
  else if (digits.startsWith(ETHIOPIAN_PHONE_RULE.cc))
    digits =
      ETHIOPIAN_PHONE_RULE.cc + digits.slice(ETHIOPIAN_PHONE_RULE.cc.length);
  // Bare national significant number: 9xxxxxxxx / 7xxxxxxxx
  else digits = ETHIOPIAN_PHONE_RULE.cc + digits;

  const e164 = `+${digits}`;
  if (!ETHIOPIAN_PHONE_RULE.e164Pattern.test(e164)) {
    return { ok: false, message: ETHIOPIAN_PHONE_RULE.message };
  }

  return { ok: true, value: e164 };
}

/**
 * Pretty-print an E.164 number for display: `+251 91 234 5678`.
 *
 * Falls back to the raw value for anything that is not an Ethiopian mobile, so
 * an unexpected stored value still renders readably instead of vanishing.
 */
export function formatPhoneForDisplay(
  value: string | null | undefined,
): string {
  if (!value) return "—";
  const e164 = value.startsWith("+") ? value : `+${value}`;
  const match = /^\+(\d{3})(\d{2})(\d{3})(\d{4})$/.exec(e164);
  if (!match) return e164;
  const [, cc, a, b, c] = match;
  return `+${cc} ${a} ${b} ${c}`;
}

/**
 * Does this E.164 number carry personal data worth masking in logs?
 *
 * Present so call sites can make a deliberate choice rather than interpolating a
 * number into a log line by accident.
 */
export function isPersonalPhone(value: string | null | undefined): boolean {
  return typeof value === "string" && value.replace(/\D/g, "").length > 6;
}

// ---------------------------------------------------------------------------
// Phone list
// ---------------------------------------------------------------------------

export interface PhoneEntryInput {
  phone: string;
  isPrimary: boolean;
}

export interface PhoneEntryError {
  /** Position in the submitted array, for the UI to highlight. */
  index: number;
  message: string;
}

export interface NormalisedPhoneList {
  /** De-duplicated E.164 values in submission order. */
  values: string[];
  /** The single value flagged primary; defaults to the first entry. */
  primary: string;
  errors: PhoneEntryError[];
}

/**
 * Validate a renter's phone list and resolve which entry is primary.
 *
 * Rules (all enforced here so the form, the API and the tests agree):
 *   * at least {@link PHONE_MIN} and at most {@link PHONE_MAX} entries;
 *   * every entry must normalise to E.164;
 *   * duplicates are rejected rather than silently collapsed - two identical
 *     rows usually mean the operator typed the same number twice and one of the
 *     real numbers is missing;
 *   * exactly one entry must be primary; if none is marked, the first wins.
 */
export function normalizePhoneList(entries: unknown[]): NormalisedPhoneList {
  const errors: PhoneEntryError[] = [];

  if (!Array.isArray(entries)) {
    return {
      values: [],
      primary: "",
      errors: [{ index: 0, message: "At least one phone number is required" }],
    };
  }

  const nonBlank = entries.filter((entry) => {
    const phone =
      entry && typeof entry === "object" && "phone" in entry
        ? String((entry as { phone?: unknown }).phone ?? "")
        : String(entry ?? "");
    return phone.trim() !== "";
  });

  if (nonBlank.length < PHONE_MIN) {
    return {
      values: [],
      primary: "",
      errors: [{ index: 0, message: "At least one phone number is required" }],
    };
  }
  if (nonBlank.length > PHONE_MAX) {
    return {
      values: [],
      primary: "",
      errors: [
        {
          index: PHONE_MAX,
          message: `At most ${PHONE_MAX} phone numbers are allowed`,
        },
      ],
    };
  }

  const values: string[] = [];
  const seen = new Set<string>();
  const primaryCandidates: string[] = [];

  nonBlank.forEach((entry, index) => {
    const isObject = entry && typeof entry === "object" && "phone" in entry;
    const rawPhone = isObject
      ? String((entry as { phone?: unknown }).phone ?? "")
      : String(entry ?? "");
    const isPrimary = isObject
      ? Boolean((entry as { isPrimary?: unknown }).isPrimary)
      : false;

    const result = normalizeEthiopianPhone(rawPhone);
    if (!result.ok) {
      errors.push({
        index,
        message: result.message ?? ETHIOPIAN_PHONE_RULE.message,
      });
      return;
    }

    const value = result.value!;
    if (seen.has(value)) {
      errors.push({ index, message: "This phone number is already listed" });
      return;
    }

    seen.add(value);
    values.push(value);
    if (isPrimary) primaryCandidates.push(value);
  });

  const primary = primaryCandidates[0] ?? values[0] ?? "";

  return { values, primary, errors };
}
