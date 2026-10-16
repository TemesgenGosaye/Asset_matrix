import { describe, it, expect } from "vitest";
import {
  encodeFrame,
  FrameDecoder,
  toolLabel,
  type AssistantFrame,
} from "../protocol";

const frame = (type: AssistantFrame["type"]): AssistantFrame =>
  ({ type }) as AssistantFrame;

describe("encodeFrame", () => {
  it("terminates every frame with a newline", () => {
    const line = encodeFrame({ type: "text-delta", delta: "hi" });
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({ type: "text-delta", delta: "hi" });
  });

  it("keeps a multi-line payload on one wire line", () => {
    const line = encodeFrame({
      type: "text-delta",
      delta: "line one\nline two",
    });
    expect(line.split("\n")).toHaveLength(2);
    expect(line).toContain("\\n");
  });
});

describe("FrameDecoder", () => {
  it("reassembles a frame split across network chunks", () => {
    const decoder = new FrameDecoder();
    const line = encodeFrame({ type: "text-delta", delta: "hello" });

    // Split mid-JSON, which is what a real chunk boundary does to a stream.
    const cut = Math.floor(line.length / 2);
    expect(decoder.push(line.slice(0, cut))).toEqual([]);
    expect(decoder.push(line.slice(cut))).toEqual([
      { type: "text-delta", delta: "hello" },
    ]);
  });

  it("emits every frame present in one chunk", () => {
    const decoder = new FrameDecoder();
    const chunk =
      encodeFrame({ type: "text-delta", delta: "a" }) +
      encodeFrame({ type: "text-delta", delta: "b" });
    expect(decoder.push(chunk)).toHaveLength(2);
  });

  it("drops a malformed line without aborting the rest of the turn", () => {
    const decoder = new FrameDecoder();
    const chunk =
      "{not json\n" + encodeFrame({ type: "text-delta", delta: "survived" });
    expect(decoder.push(chunk)).toEqual([
      { type: "text-delta", delta: "survived" },
    ]);
  });

  it("ignores unknown frame types", () => {
    const decoder = new FrameDecoder();
    const chunk =
      encodeFrame({ type: "totally-made-up" } as unknown as AssistantFrame) +
      encodeFrame({ type: "text-delta", delta: "ok" });
    expect(decoder.push(chunk)).toEqual([{ type: "text-delta", delta: "ok" }]);
  });

  it("flushes a trailing frame that never got its newline", () => {
    const decoder = new FrameDecoder();
    decoder.push('{"type":"text-delta","delta":"tail"}');
    expect(decoder.flush()).toEqual([{ type: "text-delta", delta: "tail" }]);
  });

  it("is empty on flush when the stream ended cleanly", () => {
    const decoder = new FrameDecoder();
    decoder.push(encodeFrame({ type: "done" }));
    expect(decoder.flush()).toEqual([]);
  });

  it("does not re-emit a flushed frame", () => {
    const decoder = new FrameDecoder();
    decoder.push('{"type":"text-delta","delta":"x"}');
    expect(decoder.flush()).toHaveLength(1);
    expect(decoder.flush()).toHaveLength(0);
  });
});

describe("frame type coverage", () => {
  it("recognises every frame the route can emit", () => {
    const decoder = new FrameDecoder();
    const types = [
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
    ] as const;
    const chunk = types.map((t) => encodeFrame(frame(t))).join("");
    expect(decoder.push(chunk)).toHaveLength(types.length);
  });
});

describe("toolLabel", () => {
  it("humanises a known tool", () => {
    expect(toolLabel("searchAssets")).toMatch(/asset/i);
  });

  it("returns something printable for an unknown tool", () => {
    const label = toolLabel("someToolWeDoNotKnow");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});
