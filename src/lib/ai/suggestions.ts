/**
 * Follow-up suggestions.
 *
 * An answer is a fork in the road, not an ending. Once Meri has said "there are
 * 14 people waiting", the questions worth answering next are predictable and
 * the user should not have to type them. Suggesting them turns a one-shot tool
 * into something that keeps being useful, and it does so without a second model
 * call — the mapping is deterministic, which is what makes it instant and free.
 *
 * The mapping is intentionally topic-driven rather than transcript-driven: it
 * keys off which tool produced the answer, so the suggestions are always
 * questions the assistant can actually answer next.
 */

export interface Suggestion {
  label: string;
  prompt: string;
}

/** Tool name to the questions that naturally follow it. */
const BY_TOOL: Record<string, Suggestion[]> = {
  getHouseCounts: [
    {
      label: "Occupancy rate",
      prompt: "What is the current housing occupancy rate?",
    },
    { label: "Empty houses", prompt: "Which houses are currently vacant?" },
    {
      label: "Waiting queue",
      prompt: "How many employees are waiting on the house queue?",
    },
  ],
  getHousingKpis: [
    {
      label: "By house type",
      prompt: "Show the occupancy breakdown by house type.",
    },
    {
      label: "Allocation trend",
      prompt: "How many houses were allocated this month?",
    },
    {
      label: "Inspection holds",
      prompt: "How many houses are on pending inspection hold?",
    },
  ],
  queryHouseQueue: [
    {
      label: "Top candidates",
      prompt: "Who are the top 5 waiting candidates?",
    },
    {
      label: "By job grade",
      prompt: "How many waiting employees are in each job grade?",
    },
    {
      label: "Eligibility",
      prompt: "Explain the eligibility rules for the queue.",
    },
  ],
  explainEligibility: [
    {
      label: "Queue size",
      prompt: "How many employees are waiting on the house queue?",
    },
    {
      label: "Top candidates",
      prompt: "Who are the top 5 waiting candidates?",
    },
    { label: "Vacant houses", prompt: "Which houses are currently vacant?" },
  ],
  searchHouseholds: [
    {
      label: "Occupancy split",
      prompt: "Show the occupancy breakdown by house type.",
    },
    {
      label: "Inspection holds",
      prompt: "How many houses are on pending inspection hold?",
    },
    {
      label: "Queue size",
      prompt: "How many employees are waiting on the house queue?",
    },
  ],
  getInspectionSummary: [
    {
      label: "Inspection detail",
      prompt: "Which houses have unresolved handback inspections?",
    },
    { label: "Vacant houses", prompt: "Which houses are currently vacant?" },
    {
      label: "Queue size",
      prompt: "How many employees are waiting on the house queue?",
    },
  ],
  getAssetCount: [
    {
      label: "Warranties",
      prompt: "Which assets have warranties expiring in the next 60 days?",
    },
    {
      label: "Stock alerts",
      prompt: "Which consumables and licences need attention?",
    },
    {
      label: "By category",
      prompt: "How many assets are there in each category?",
    },
  ],
  getAssetDetails: [
    {
      label: "Warranties",
      prompt: "Which assets have warranties expiring in the next 60 days?",
    },
    {
      label: "Stock alerts",
      prompt: "Which consumables and licences need attention?",
    },
    {
      label: "Estate value",
      prompt: "What is the total purchase value of the asset estate?",
    },
  ],
  searchAssets: [
    {
      label: "Warranties",
      prompt: "Which assets have warranties expiring in the next 60 days?",
    },
    {
      label: "Estate value",
      prompt: "What is the total purchase value of the asset estate?",
    },
    {
      label: "Stock alerts",
      prompt: "Which consumables and licences need attention?",
    },
  ],
  getExpiringWarranties: [
    {
      label: "Full estate",
      prompt:
        "How many assets are registered and what is the total purchase value?",
    },
    {
      label: "Stock alerts",
      prompt: "Which consumables and licences need attention?",
    },
    {
      label: "By category",
      prompt: "How many assets are there in each category?",
    },
  ],
  getStockAlerts: [
    {
      label: "Reorder list",
      prompt: "Which consumables are below their minimum quantity?",
    },
    {
      label: "Licence seats",
      prompt: "Which licences are running out of seats?",
    },
    {
      label: "Estate value",
      prompt: "What is the total purchase value of the asset estate?",
    },
  ],
  searchTickets: [
    { label: "Open tickets", prompt: "How many open tickets are there?" },
    { label: "Recent tickets", prompt: "Show the most recent tickets." },
    {
      label: "Queue size",
      prompt: "How many employees are waiting on the house queue?",
    },
  ],
  draftMaintenanceTicket: [
    { label: "Open tickets", prompt: "How many open tickets are there?" },
    {
      label: "Warranties",
      prompt: "Which assets have warranties expiring in the next 60 days?",
    },
  ],
};

/** Used when no tool ran, so the assistant still offers a way forward. */
const GENERAL: Suggestion[] = [
  {
    label: "Queue size",
    prompt: "How many employees are waiting on the house queue?",
  },
  { label: "Occupancy", prompt: "What is the current housing occupancy rate?" },
  {
    label: "Asset estate",
    prompt:
      "How many assets are registered and what is the total purchase value?",
  },
  {
    label: "Needs attention",
    prompt: "Which consumables and licences need attention?",
  },
];

/** Questions already answered in this exchange, so none are suggested twice. */
const ASKED_PATTERNS = [
  "how many employees are waiting",
  "occupancy rate",
  "warranties expiring",
  "consumables",
  "total purchase value",
  "eligibility",
  "top 5",
  "breakdown by house type",
  "open tickets",
  "recent tickets",
  "below their minimum",
  "running out of seats",
  "each category",
  "each job grade",
  "unresolved handback",
  "currently vacant",
  "allocated this month",
  "assets are registered",
];

/** Cheap relevance test — is this follow-up already covered by the transcript? */
function alreadyAsked(prompt: string): boolean {
  const needle = prompt.toLowerCase();
  return ASKED_PATTERNS.some((asked) => needle.includes(asked));
}

/**
 * Fast-lane intent ids mapped to the tool that answers the same question.
 *
 * The fast lane names its intents after the *question shape* (`queue.byGrade`)
 * while the reasoning lane names its tools after the *data source*
 * (`queryHouseQueue`). Without this bridge a fast-lane answer would have no
 * follow-ups at all, which is backwards — fast-lane answers are exactly the
 * ones that most obviously invite a next question.
 */
const INTENT_TO_TOOL: Record<string, string> = {
  "housing.counts": "getHouseCounts",
  "housing.statusCounts": "getHouseCounts",
  "housing.registerStatus": "getHouseCounts",
  "housing.breakdown": "getHousingKpis",
  "housing.occupantOf": "searchHouseholds",
  "queue.size": "queryHouseQueue",
  "queue.byGrade": "queryHouseQueue",
  "queue.position": "explainEligibility",
  "inspections.summary": "getInspectionSummary",
  "assets.counts": "getAssetCount",
  "assets.estateValue": "getAssetCount",
  "assets.expiringWarranties": "getExpiringWarranties",
  "assets.stockAlerts": "getStockAlerts",
  "tickets.summary": "searchTickets",
  "employees.counts": "getHousingKpis",
  "support.capabilities": "getHouseCounts",
};

/** Translate either a fast-lane intent id or a tool name to the tool key. */
function toToolKey(key: string): string {
  return INTENT_TO_TOOL[key] ?? key;
}

/**
 * Pick up to three follow-ups for an answer.
 *
 * @param keys       Tool names or fast-lane intent ids that produced the answer.
 * @param transcript Prior questions in the exchange, so nothing is offered twice.
 */
export function suggestFollowUps(
  keys: string[],
  transcript: string[] = [],
): Suggestion[] {
  const asked = transcript.join(" ").toLowerCase();
  const candidates: Suggestion[] = [];

  for (const key of keys) {
    for (const suggestion of BY_TOOL[toToolKey(key)] ?? []) {
      candidates.push(suggestion);
    }
  }
  candidates.push(...GENERAL);

  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const suggestion of candidates) {
    if (out.length >= 3) break;
    if (seen.has(suggestion.prompt)) continue;
    if (asked.includes(suggestion.prompt.toLowerCase())) continue;
    if (alreadyAsked(suggestion.prompt)) continue;
    seen.add(suggestion.prompt);
    out.push(suggestion);
  }
  return out;
}

/**
 * Localised follow-ups.
 *
 * Amharic questions get Amharic follow-ups. Deriving them by translation at
 * runtime would need a model call, so the Amharic set is authored here for the
 * topics the assistant actually answers most.
 */
const AM_BY_LABEL: Record<string, string> = {
  "Occupancy rate": "የቤት አጠቃቀም መጠን ስንት ነው?",
  "Empty houses": "አሁን የሚሸምሩ ቤቶች የትኛር ናቸው?",
  "Waiting queue": "በቤት ሰልፍ ላይ የሚጠብቁ ሠራታን ብዛታ በርፍት አለ?",
  "By house type": "በቤት አይነት የመኖሪያ አጠቃቀም አሃዝን አሳየኝ።",
  "Allocation trend": "በዚህ ወር ብዛታ ቤቶች ተለክተዋል?",
  "Inspection holds": "በምርመራ ማቆም ላይ የሚገኙ ቤቶች ብዛታ በርፍት አለ?",
  "Top candidates": "ከፍተኛ 5 የሚጠብቁ ተጠቃሚዎች ከማን ናቸው?",
  "By job grade": "በእያንዳንዱ የሥራ ደረጃ የሚጠብቁ ሠራታን ብዛታ በርፍት ነው?",
  Eligibility: "የሰልፉን መብት ህግዎች አስረያግዩ።",
  Warranties: "በሚቀጥሉት 60 ቀናት የጋራቸው ማቆረጥ ያለባቸው ሕብምቦች ከትኛር ናቸው?",
  "Stock alerts": "የተለያዩ ቁሳብና ፈቃዶች ማስተዋል የሚፈልጉ ታይለዋል?",
  "By category": "በእያንዳንዱ የሕብምብ ደረጃ ብዛታ ሕብምቦች አሉ?",
  "Estate value": "የሕብምብ ብዛታና ጠቅላላ የግዢ ዋጋ ብዛታ በርፍት አለ?",
  "Reorder list": "የሚደረሱ ቁሳቦች ከዝቅተኛ መጠን በታች ያሉ ታይለዋሉ?",
  "Licence seats": "የተሰጡ ቆርኖች የሚቀሩ የስት ቁጥር ላይ ሳይደርሱ ታይለዋሉ?",
  "Open tickets": "በርፍት የተከፋፈሉ ቅሬታዎች ብዛታ በርፍት አለ?",
  "Recent tickets": "የቅርብ ጊዜ ቅሬታዎችን አሳየኝ።",
  "Inspection detail": "ያልተፈታ የመመለስ ምርመራ ያላቸው ቤቶች ከትኛር ናቸው?",
  "Asset estate": "ተመዝግበው የሕብምብ ብዛታ እና ጠቅላላ የግዢ ዋጋ ብዛታ በርፍት አለ?",
  "Needs attention": "የተለያዩ ቁሳብና ፈቃዶች ማስተዋል የሚፈልጉ ታይለዋል?",
  Occupancy: "የቤት አጠቃቀም መጠን ስንት ነው?",
};

/** Translate a suggestion set, dropping anything without an authored Amharic form. */
export function localizeSuggestions(
  suggestions: Suggestion[],
  locale: "en" | "am",
): Suggestion[] {
  if (locale === "en") return suggestions;
  return suggestions
    .map((s) => ({ label: s.label, prompt: AM_BY_LABEL[s.label] }))
    .filter((s): s is Suggestion => Boolean(s.prompt));
}
