import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeObject } from "@/lib/sanitize";

describe("sanitizeHtml", () => {
  it("strips a simple HTML tag", () => {
    expect(sanitizeHtml("<b>bold</b>")).toBe("bold");
  });

  it("strips script tags", () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).not.toContain(
      "<script>",
    );
  });

  it("strips nested HTML tags", () => {
    expect(sanitizeHtml("<div><p><span>hello</span></p></div>")).toBe("hello");
  });

  it("strips self-closing tags", () => {
    expect(sanitizeHtml("line1<br/>line2")).toBe("line1line2");
  });

  it("strips tags with event handler attributes", () => {
    const result = sanitizeHtml('<img onerror="alert(1)" src="x">');
    expect(result).not.toContain("onerror");
  });

  it("decodes &amp; to &", () => {
    expect(sanitizeHtml("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });

  it("decodes &lt; and &gt;", () => {
    expect(sanitizeHtml("1 &lt; 2 &gt; 0")).toBe("1 < 2 > 0");
  });

  it("decodes &quot; to double quote", () => {
    expect(sanitizeHtml("say &quot;hello&quot;")).toBe('say "hello"');
  });

  it("decodes &#39; to single quote", () => {
    expect(sanitizeHtml("it&#39;s")).toBe("it's");
  });

  it("returns empty string unchanged", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("preserves plain text without any HTML", () => {
    expect(sanitizeHtml("Hello, World!")).toBe("Hello, World!");
  });

  it("handles a string that is only HTML tags", () => {
    expect(sanitizeHtml("<div><span></span></div>")).toBe("");
  });
});

describe("sanitizeObject", () => {
  it("sanitizes only the specified string fields", () => {
    const input = {
      name: "<b>Test</b>",
      description: '<script>alert("xss")</script>Clean',
      count: 42,
    };
    const result = sanitizeObject(input, ["name", "description"]);
    expect(result.name).toBe("Test");
    expect(result.description).not.toContain("<script>");
    expect(result.count).toBe(42);
  });

  it("leaves unspecified fields completely untouched", () => {
    const input = {
      title: "<i>Title</i>",
      body: "<b>Body</b>",
    };
    const result = sanitizeObject(input, ["title"]);
    expect(result.title).toBe("Title");
    expect(result.body).toBe("<b>Body</b>");
  });

  it("returns a shallow copy (does not mutate the original)", () => {
    const input = { name: "<b>Test</b>" };
    const result = sanitizeObject(input, ["name"]);
    expect(result).not.toBe(input);
    expect(input.name).toBe("<b>Test</b>");
    expect(result.name).toBe("Test");
  });

  it("handles an empty fields array", () => {
    const input = { name: "<b>Test</b>" };
    const result = sanitizeObject(input, []);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });
});
