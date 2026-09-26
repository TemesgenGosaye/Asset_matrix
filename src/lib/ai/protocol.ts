/**
 * Wire protocol between the assistant route and the drawer.
 *
 * One protocol serves both lanes, which is what lets the client stay honest about
 * latency. The route always answers `application/x-ndjson`: one JSON frame per
 * line, flushed as it is produced.
 *
 *   {"type":"meta","lane":"fast","intent":"housing.counts","ms":12,"cached":true}
 *   {"type":"card","card":{...}}
 *   {"type":"text-delta","delta":"There are 42 "}
 *   {"type":"tool","tool":"queryHouseQueue","label":"Reading the house queue"}
 *   {"type":"done"}
 *   {"type":"error","message":"..."}
 *
 * The `meta` frame is the contract that kills the spinner: it always arrives
 * first, and it names the lane. A fast-lane answer is complete by the time
 * `card` lands, so the client renders it with no thinking state at all. A
 * reasoning-lane answer may spend seconds inside the model before its first
 * token, so only that lane is allowed to show an indicator.
 *
 * Both ends import these types, so a frame the client cannot render is a
 * compile error rather than a raw JSON blob in the transcript.
 */

import type { AssistantMeta, FastCard } from "./card";

export type { AssistantMeta, FastCard };

export interface MetaFrame extends AssistantMeta {
  type: "meta";
}

export interface CardFrame {
  type: "card";
  card: FastCard;
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

export interface DoneFrame {
  type: "done";
}

export interface ErrorFrame {
  type: "error";
  message: string;
}

export type AssistantFrame =
  | MetaFrame
  | CardFrame
  | TextDeltaFrame
  | ToolFrame
  | DoneFrame
  | ErrorFrame;

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/** Turn a frame into its newline-terminated wire form. */
export function encodeFrame(frame: AssistantFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

function isFrame(value: unknown): value is AssistantFrame {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "meta" ||
    type === "card" ||
    type === "text-delta" ||
    type === "tool" ||
    type === "done" ||
    type === "error"
  );
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
  getAssetEstateValue: "Totalling the asset estate",
  getStockAlerts: "Checking stock and licence levels",
  searchTickets: "Searching tickets",
  draftMaintenanceTicket: "Preparing a ticket draft",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? `Running ${tool}`;
}
