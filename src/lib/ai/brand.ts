/**
 * Meri — assistant identity for the HAMS (Housing & Asset Management System) portal.
 *
 * Name rationale: "መሪ" (məri) is the Amharic word for *guidance* — a principle, a
 * policy, the thing that tells you which way to go. It is short, it is a noun the
 * portal can legitimately use as a title ("የMeri መመሪ" is odd, but "Meri እወዳለህ" is
 * natural), and it transliterates to a clean Latin "Meri" that does not need
 * diacritics in the English UI.
 *
 * Functionally it describes exactly what the assistant does: it does not decide,
 * it guides. The fast lane states the recorded fact; the reasoning lane walks a
 * user to the decision using the portal's own business rules. It also keeps the
 * mark distinct from the person asking — a colleague you consult, not a system
 * that commands you.
 */

export const ASSISTANT_ID = "meri";

export const ASSISTANT_BRAND = {
  /** Ethiopic name — the primary mark. */
  name: "መሪ",
  /** Latin transliteration used across the English UI. */
  latin: "Meri",
  /** Combined lockup, e.g. "መሪ · Meri". */
  lockup: "መሪ · Meri",
  /** Meaning, shown in the identity popover and in the system prompt. */
  meaning: {
    en: "Guidance — the principle that shows the way",
    am: "መመሪ — መንገዱን የሚያሳይ መርህ",
  },
  tagline: {
    en: "Housing & Asset System Guidance",
    am: "የቤትና ሕብምብ ስርዓት መመሪ",
  },
  /** Short scope line for the drawer header. */
  scope: {
    en: "System support for the HAMS portal",
    am: "የHAMS ዲስክ ድጋፍ",
  },
} as const;

/**
 * Suggested openings shown before the first question. Each maps to a known
 * fast-lane intent so the very first interaction is already instant.
 */
export interface QuickAction {
  id: string;
  label: { en: string; am: string };
  prompt: { en: string; am: string };
  tone: "housing" | "queue" | "assets" | "support";
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "active-houses",
    label: { en: "Active houses", am: "ንቁ ቤቶች" },
    prompt: {
      en: "How many active houses are there?",
      am: "ትክክለኛ ንቁ ቤቶች ብዛታ በርፍት አለ?",
    },
    tone: "housing",
  },
  {
    id: "queue-size",
    label: { en: "Waiting queue", am: "የጥበባ ሰልፍ" },
    prompt: {
      en: "How many employees are waiting on the house queue?",
      am: "በቤት ሰልፍ ላይ የሚጠብቁ ሠራታን ብዛታ በርፍት አለ?",
    },
    tone: "queue",
  },
  {
    id: "top-candidates",
    label: { en: "Top candidates", am: "ከፍተኛ ተጠቃሚዎች" },
    prompt: {
      en: "Who are the top 5 waiting candidates?",
      am: "ከፍተኛ 5 የሚጠብቁ ተጠቃሚዎች ከማን ናቸው?",
    },
    tone: "queue",
  },
  {
    id: "occupancy",
    label: { en: "Occupancy breakdown", am: "የመኖሪያ አጠቃቀም" },
    prompt: {
      en: "Show the housing occupancy breakdown by house type.",
      am: "በቤት አይነት የመኖሪያ አጠቃቀም አሃዝን አሳየኝ።",
    },
    tone: "housing",
  },
  {
    id: "pending-inspections",
    label: { en: "Inspection holds", am: "የምርመራ ማቆም" },
    prompt: {
      en: "How many houses are on pending inspection hold?",
      am: "በምርመራ ማቆም ላይ የሚገኙ ቤቶች ብዛታ በርፍት አለ?",
    },
    tone: "housing",
  },
  {
    id: "asset-total",
    label: { en: "Asset estate", am: "የሕብምብ መዋጮ" },
    prompt: {
      en: "How many assets are registered and what is the total purchase value?",
      am: "ተመዝግበው የሕብምብ ብዛታ እና ጠቅላላ የግዢ ዋጋ ብዛታ በርፍት አለ?",
    },
    tone: "assets",
  },
  {
    id: "capabilities",
    label: { en: "What can you do?", am: "ምን ልታወቅኝ ይችላሉ?" },
    prompt: {
      en: "What can you help me with?",
      am: "ከማን እንዳግብርኝ ይችላሉ?",
    },
    tone: "support",
  },
];

/** Resolve the right locale copy for a quick action. */
export function quickActionText(
  action: QuickAction,
  locale: "en" | "am",
): { label: string; prompt: string } {
  return { label: action.label[locale], prompt: action.prompt[locale] };
}
