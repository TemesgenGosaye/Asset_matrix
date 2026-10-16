import { describe, expect, it } from "vitest";
import { amountInAmharicWords, amountInEnglishWords } from "../amount-words";

describe("amountInAmharicWords", () => {
  it("names the units and closes with ብር ብቻ", () => {
    expect(amountInAmharicWords("5.00")).toBe("አምስት ብር ብቻ");
  });

  it("names the teens with their tens prefix", () => {
    expect(amountInAmharicWords("11.00")).toBe("አሥር አንድ ብር ብቻ");
    expect(amountInAmharicWords("19.00")).toBe("አሥር ዘጠኝ ብር ብቻ");
  });

  it("names exact tens without a stray ones word", () => {
    expect(amountInAmharicWords("20.00")).toBe("ኪሳ ብር ብቻ");
    expect(amountInAmharicWords("90.00")).toBe("ሰማንያ ብር ብቻ");
  });

  it("composes hundreds as አንድ መቶ", () => {
    expect(amountInAmharicWords("100.00")).toBe("አንድ መቶ ብር ብቻ");
  });

  it("composes thousands, hundreds and units additively", () => {
    expect(amountInAmharicWords("1250.00")).toBe("አንድ ሺህ ሁለት መቶ ሃምሳ ብር ብቻ");
    expect(amountInAmharicWords("45000.00")).toBe("አርባ አምስት ሺህ ብር ብቻ");
  });

  it("crosses into millions", () => {
    expect(amountInAmharicWords("1250000.00")).toBe(
      "አንድ ሚሊዮን ሁለት መቶ ሃምሳ ሺህ ብር ብቻ",
    );
  });

  it("lengthens the tens of 70 before a ones word", () => {
    expect(amountInAmharicWords("70.00")).toBe("ሰባ ብር ብቻ");
    expect(amountInAmharicWords("75.00")).toBe("ሰባት አምስት ብር ብቻ");
  });

  it("names santim as cents, not as a decimal point", () => {
    expect(amountInAmharicWords("1250.75")).toBe(
      "አንድ ሺህ ሁለት መቶ ሃምሳ ብር ሰባት አምስት ሳንት ብቻ",
    );
  });

  it("names a zero amount as ዜሮ rather than emitting nothing", () => {
    expect(amountInAmharicWords("0.00")).toBe("ዜሮ ብር ብቻ");
  });

  it("accepts numbers and Prisma.Decimal-like values", () => {
    expect(amountInAmharicWords(1250)).toBe("አንድ ሺህ ሁለት መቶ ሃምሳ ብር ብቻ");
    expect(amountInAmharicWords({ toFixed: () => "7.50" })).toBe(
      "ሰባት ብር ሃምሳ ሳንት ብቻ",
    );
  });

  it("falls back to zero for unparseable input instead of throwing", () => {
    expect(amountInAmharicWords("not-a-number")).toBe("ዜሮ ብር ብቻ");
    expect(amountInAmharicWords(null)).toBe("ዜሮ ብር ብቻ");
  });
});

describe("amountInEnglishWords", () => {
  it("names units and closes with only", () => {
    expect(amountInEnglishWords("5.00")).toBe("five birr only");
  });

  it("names the teens without a stray ones word", () => {
    expect(amountInEnglishWords("17.00")).toBe("seventeen birr only");
  });

  it("composes hundreds and thousands with hyphens", () => {
    expect(amountInEnglishWords("1250.00")).toBe(
      "one thousand two hundred fifty birr only",
    );
  });

  it("crosses into millions", () => {
    expect(amountInEnglishWords("1250000.00")).toBe(
      "one million two hundred fifty thousand birr only",
    );
  });

  it("names cents as santim", () => {
    expect(amountInEnglishWords("1250.75")).toBe(
      "one thousand two hundred fifty birr and seventy-five santim only",
    );
  });

  it("names a zero amount", () => {
    expect(amountInEnglishWords("0.00")).toBe("zero birr only");
  });
});
