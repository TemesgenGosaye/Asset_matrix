/**
 * Amount in words, Amharic and English.
 *
 * A figure written only in digits is a figure someone can alter by hand: a
 * `1` becomes a `7`, a decimal point moves, a digit is dropped. A figure
 * written out in words cannot be altered without the alteration being visible,
 * which is why both the rent receipt and the lease statement carry the amount
 * twice - once as digits for arithmetic and once in words for the record.
 *
 * Amharic is the language of the record: the document is signed in Amharic, so
 * that is the wording that has to be unambiguous. English is included
 * alongside because the portal's staff and the auditors who check these forms
 * work in both.
 *
 * No Prisma import: this runs in the browser as part of rendering a preview.
 */

import { formatEtbNumber } from "./money-display";

/** Digits 0-9. */
const ONES = [
  "ዜሮ",
  "አንድ",
  "ሁለት",
  "ሦስት",
  "አራት",
  "አምስት",
  "ስድስት",
  "ሰባት",
  "ስምንት",
  "ዘጠኝ",
];

/** Tens 10-90. */
const TENS = [
  "",
  "አሥር",
  "ኪሳ",
  "ሰላሳ",
  "አርባ",
  "ሃምሳ",
  "ስድሳ",
  "ሰባ",
  "ስምና",
  "ሰማንያ",
] as const;

/**
 * Scale words. `group(value)` multiplies into the word above it.
 *
 * `ሺህ` (thousand) takes a preceding multiplier - `አንድ ሺህ`, `ሦስት ሺህ` - so it
 * is declared as a plain word. `መቶ` (hundred) only ever counts 1-9, so it is
 * declared with its multiplier baked in, which is also how it is written.
 */
const HUNDRED = "መቶ";
const THOUSAND = "ሺህ";
const MILLION = "ሚሊዮን";

const AMHARIC_CURRENCY = "ብር";
const AMHARIC_CENTS = "ሳንት";

/**
 * `አንድ ሺህ ሁለት መቶ ሃምሳ` style composition.
 *
 * Amharic composes additively with no conjunction between the groups, so the
 * parts are joined by a space. A zero group is omitted entirely rather than
 * rendered as `ዜሮ`, which never appears in a spoken amount.
 */
function amharicBelowThousand(value: number): string {
  if (value === 0) return "";
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} ${HUNDRED}`);
  if (rest === 0) {
    // An exact hundred or thousand takes no tens part: `አንድ መቶ`, never
    // `አንድ መቶ ዜሮ`.
  } else if (rest >= 20) {
    // An exact ten drops the ones word: `ኪሳ`, not `ኪሳ ዜሮ`.
    //
    // 70 is the one irregular tens. Alone it is `ሰባ`, but before a ones word it
    // lengthens to `ሰባት`: 75 is `ሰባት አምስት`, never `ሰባ አምስት`. Every other
    // tens keeps its short form (`አርቫ አምስት`, `ስድሳ ስምንት`).
    const ones = rest % 10;
    const tensWord =
      rest >= 70 && rest < 80 ? "ሰባት" : TENS[Math.floor(rest / 10)];
    parts.push(
      ones === 0 ? TENS[Math.floor(rest / 10)] : `${tensWord} ${ONES[ones]}`,
    );
  } else if (rest >= 10) {
    // 10-19 take the tens word plus a ones word: `አሥር አንድ`, `አሥር ዘጠኝ`.
    parts.push(`${TENS[1]} ${ONES[rest - 10]}`);
  } else {
    parts.push(ONES[rest]);
  }
  return parts.join(" ");
}

/** Split `value` into its thousands groups and name each one. */
function amharicGroups(value: number): string[] {
  const groups: string[] = [];
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1_000);
  const remainder = value % 1_000;

  if (millions > 0) {
    groups.push(`${amharicBelowThousand(millions)} ${MILLION}`.trim());
  }
  if (thousands > 0) {
    groups.push(`${amharicBelowThousand(thousands)} ${THOUSAND}`.trim());
  }
  const low = amharicBelowThousand(remainder);
  if (low) groups.push(low);
  return groups;
}

const EN_ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

/** 20-90. The teens are irregular, so they live in `EN_TEENS` instead. */
const EN_TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

/** 10-19. */
const EN_TEENS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

function englishBelowThousand(value: number): string {
  if (value === 0) return "";
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds > 0) parts.push(`${EN_ONES[hundreds]} hundred`);
  if (rest > 0) parts.push(englishBelowHundred(rest));
  return parts.join(" ");
}

/**
 * 1-99.
 *
 * The teens are irregular (`seventeen`, not `seven-teen`), so they get their
 * own table. `EN_TENS` therefore only covers 20 and up.
 */
function englishBelowHundred(value: number): string {
  if (value >= 20) {
    const tens = EN_TENS[Math.floor(value / 10)];
    // An exact multiple of ten has no ones part; `fifty-zero` is not English.
    return value % 10 === 0 ? tens : `${tens}-${EN_ONES[value % 10]}`;
  }
  if (value >= 10) return EN_TEENS[value - 10];
  return EN_ONES[value];
}

/**
 * Split a money value into whole birr and santim.
 *
 * Accepts anything the rest of the module accepts (decimal string, number,
 * Prisma.Decimal-like) and returns integers, so no rounding happens on the way
 * to the wording.
 */
function splitAmount(value: unknown): { whole: number; cents: number } {
  // `formatEtbNumber` groups the thousands (`1,250.00`), which `Number` would
  // read as NaN - so the separators come back off before conversion.
  const [whole = "0", fraction = "00"] = formatEtbNumber(value)
    .replace(/,/g, "")
    .split(".");
  return { whole: Number(whole), cents: Number(fraction) };
}

/**
 * The amount written out in Amharic, e.g.
 * `አንድ ሺህ ሁለት መቶ ሃምሳ ብር ብቻ`.
 *
 * `ብር ብቻ` ("birr only") closes it: the sum is complete, there is no
 * remainder or consideration. That is the standard closing on an Ethiopian
 * money document and it is what makes the wording a total rather than a
 * partial.
 */
export function amountInAmharicWords(value: unknown): string {
  const { whole, cents } = splitAmount(value);
  const parts = amharicGroups(whole);
  const head = parts.length > 0 ? parts.join(" ") : ONES[0];
  // The number precedes its unit: `ሰባት አምስት ሳንት`, as everywhere else in the
  // wording above.
  const currency =
    cents > 0 ? `${amharicBelowThousand(cents)} ${AMHARIC_CENTS}` : "";
  return currency
    ? `${head} ${AMHARIC_CURRENCY} ${currency} ብቻ`
    : `${head} ${AMHARIC_CURRENCY} ብቻ`;
}

/**
 * The amount written out in English, e.g.
 * `one thousand two hundred fifty birr only`.
 *
 * Fractions are named as santim rather than as a decimal, matching the
 * Amharic wording so the two lines say the same thing.
 */
export function amountInEnglishWords(value: unknown): string {
  const { whole, cents } = splitAmount(value);
  const head = whole === 0 ? EN_ONES[0] : englishWhole(whole);
  const fraction = cents > 0 ? ` and ${englishBelowHundred(cents)} santim` : "";
  return `${head} birr${fraction} only`;
}

/** Whole-number English wording: millions, thousands, remainder. */
function englishWhole(value: number): string {
  const parts: string[] = [];
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1_000);
  const remainder = value % 1_000;
  if (millions > 0) parts.push(`${englishBelowThousand(millions)} million`);
  if (thousands > 0) parts.push(`${englishBelowThousand(thousands)} thousand`);
  const low = englishBelowThousand(remainder);
  if (low) parts.push(low);
  return parts.join(" ");
}
