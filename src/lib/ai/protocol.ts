/**
 * Wire protocol between the assistant route and the drawer.
 *
 * One protocol serves both lanes, which is what lets the client stay honest about
 * latency. The route always answers `application/x-ndjson`: one JSON frame per
 * line, flushed as it is produced.
 *
 *   {"type":"meta","lane":"fast","intent":"housing.counts","ms":12,"cached":true}
 *   {"type":"card","card":{...}}
 *   {"type":"provider","provider":"ollama","model":"qwen2.5:7b-instruct","kind":"local"}
 *   {"type":"text-delta","delta":"There are 42 "}
 *   {"type":"tool","tool":"queryHouseQueue","label":"Reading the house queue"}
 *   {"type":"sources","sources":[{"label":"House queue","href":"/house-queue"}]}
 *   {"type":"suggestions","suggestions":[{"label":"Top candidates","prompt":"..."}]}
 *   {"type":"usage","inputTokens":812,"outputTokens":96}
 *   {"type":"done"}
 *   {"type":"error","message":"..."}
 *
 * The `meta` frame is the contract that kills the spinner: it always arrives
 * first, and it names the lane. A fast-lane answer is complete by the time
 * `card` lands, so the client renders it with no thinking state at all. A
 * reasoning-lane answer may spend seconds inside the model before its first
 * token, so only that lane is allowed to show an indicator.
 *
 * `provider` is emitted before the first token of the reasoning lane, so the
 * header can say *where* the answer is being produced — cloud or a model running
 * on the user's own machine — for the entire duration rather than only at the
 * end. On a local model that distinction explains a three-second first token,
 * which no amount of spinner polish can.
 *
 * Both ends import these types, so a frame the client cannot render is a
 * compile error rather than a raw JSON blob in the transcript.
 */

import type {
  AssistantMeta,
  CardAction,
  CardStat,
  CardTable,
  CardTone,
  FastCard,
} from "./card";

export type {
  AssistantMeta,
  CardAction,
  CardStat,
  CardTable,
  CardTone,
  FastCard,
};

/** Provider identity, mirrored from the server's provider layer. */
export type AssistantProviderKind = "cloud" | "local";

export interface MetaFrame extends AssistantMeta {
  type: "meta";
  /** Present on the reasoning lane: which model is answering. */
  provider?: string;
  model?: string;
  providerKind?: AssistantProviderKind;
}

export interface CardFrame {
  type: "card";
  card: FastCard;
}

/**
 * Which model is producing this answer, and where it runs.
 *
 * Sent once, immediately after `meta`, so the drawer header can be honest about
 * the wait before there is anything to show.
 */
export interface ProviderFrame {
  type: "provider";
  provider: string;
  model: string;
  kind: AssistantProviderKind;
  /** False when the model was reached through a fallback. */
  primary?: boolean;
}

export interface TextDeltaFrame {
  type: "text-delta";
  delta: string;
}

/**
 * A tool call started. Purely presentational — it tells the user *what* the
 * assistant is reaching for, which is the difference between a two-second wait
 * that feels like work and one that feels broken.
 */
export interface ToolFrame {
  type: "tool";
  tool: string;
  label: string;
}

/** Deep links the answer is grounded in, so the user can verify or act. */
export interface SourceFrame {
  type: "sources";
  sources: CardAction[];
}

/** Follow-up questions worth asking next. Deterministic, so it costs nothing. */
export interface SuggestionFrame {
  type: "suggestions";
  suggestions: { label: string; prompt: string }[];
}

/** Token accounting, when the provider reports it. */
export interface UsageFrame {
  type: "usage";
  inputTokens?: number;
  outputTokens?: number;
}

export interface DoneFrame {
  type: "done";
}

export interface ErrorFrame {
  type: "error";
  message: string;
  /**
   * True when the model failed but the turn produced no text at all, so the
   * client can offer a retry rather than just an error.
   */
  retryable?: boolean;
}

export type AssistantFrame =
  | MetaFrame
  | CardFrame
  | ProviderFrame
  | TextDeltaFrame
  | ToolFrame
  | SourceFrame
  | SuggestionFrame
  | UsageFrame
  | DoneFrame
  | ErrorFrame;

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/** Turn a frame into its newline-terminated wire form. */
export function encodeFrame(frame: AssistantFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

const FRAME_TYPES = new Set([
  "meta",
  "card",
  "provider",
  "text-delta",
  "tool",
  "sources",
  "suggestions",
  "usage",
  "done",
  "error",
]);

function isFrame(value: unknown): value is AssistantFrame {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && FRAME_TYPES.has(type);
}

/**
 * Incremental NDJSON reader.
 *
 * Network chunks do not respect frame boundaries — a single `read()` can return
 * half a frame, or three and a half. This buffers the remainder and only emits
 * whole frames, so a card is never rendered from a truncated JSON object.
 */
export class FrameDecoder {
  private buffer = "";

  /** Feed a decoded chunk, returning whatever complete frames it completed. */
  push(chunk: string): AssistantFrame[] {
    this.buffer += chunk;

    const frames: AssistantFrame[] = [];
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        try {
          const parsed: unknown = JSON.parse(line);
          if (isFrame(parsed)) frames.push(parsed);
        } catch {
          // A malformed line is dropped rather than thrown: one bad frame must
          // not abort a turn that is otherwise streaming correctly.
        }
      }
      newline = this.buffer.indexOf("\n");
    }
    return frames;
  }

  /** Flush a trailing frame from a stream that ended without a newline. */
  flush(): AssistantFrame[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    if (!rest) return [];
    try {
      const parsed: unknown = JSON.parse(rest);
      return isFrame(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  }
}

/**
 * Human label for a tool call, keyed by the tool names the assistant exposes.
 * Unknown tools fall back to their raw name so a new tool is still legible.
 */
const TOOL_LABELS: Record<string, string> = {
  getHouseCounts: "Reading the house register",
  getHousingKpis: "Reading housing statistics",
  queryHouseQueue: "Running the queue engine",
  searchHouseholds: "Searching the house register",
  getHouseDetail: "Opening the house record",
  getQueueForEmployee: "Checking the employee's queue position",
  explainEligibility: "Applying the eligibility rules",
  getInspectionSummary: "Reading handback inspections",
  searchAssets: "Searching the asset register",
  getAssetDetails: "Opening the asset record",
  getExpiringWarranties: "Checking warranty windows",
  getAssetCount: "Totalling the asset estate",
  getAssetEstateValue: "Totalling the asset estate",
  getStockAlerts: "Checking stock and licence levels",
  searchTickets: "Searching tickets",
  draftMaintenanceTicket: "Preparing a ticket draft",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? `Running ${tool}`;
}
