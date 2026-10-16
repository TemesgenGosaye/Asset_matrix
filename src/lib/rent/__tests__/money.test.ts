import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  addMoney,
  formatEtb,
  formatEtbNumber,
  isPositiveMoney,
  moneyEquals,
  multiplyMoney,
  parseAmountInput,
  roundToScale,
  subtractMoney,
  toDecimal,
  toMoneyString,
} from "../money";

describe("toDecimal", () => {
  it("passes a Decimal through untouched", () => {
    const value = new Prisma.Decimal("12.34");
    expect(toDecimal(value).toFixed(2)).toBe("12.34");
  });

  it("accepts strings, numbers and bigints", () => {
    expect(toDecimal("10.5").toFixed(2)).toBe("10.50");
    expect(toDecimal(10.5).toFixed(2)).toBe("10.50");
    // BigInt(10) rather than a `10n` literal: the tsconfig target predates ES2020,
    // where bigint literals are a syntax error.
    expect(toDecimal(BigInt(10)).toFixed(2)).toBe("10.00");
  });

  it("treats null and undefined as zero", () => {
    expect(toDecimal(null).toFixed(2)).toBe("0.00");
    expect(toDecimal(undefined).toFixed(2)).toBe("0.00");
  });
});

describe("toMoneyString", () => {
  it("always renders exactly two decimals", () => {
    expect(toMoneyString("1250")).toBe("1250.00");
    expect(toMoneyString("1250.5")).toBe("1250.50");
    expect(toMoneyString(1250)).toBe("1250.00");
    expect(toMoneyString(new Prisma.Decimal("0.1"))).toBe("0.10");
  });
});

describe("addMoney / subtractMoney / multiplyMoney", () => {
  it("is exact where float arithmetic is not", () => {
    // The canonical float failure.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addMoney("0.1", "0.2").toFixed(2)).toBe("0.30");
  });

  it("sums a long run of cents without drift", () => {
    const cents = Array.from({ length: 10 }, () => "0.01");
    expect(addMoney(...cents).toFixed(2)).toBe("0.10");
  });

  it("adds mixed input types", () => {
    expect(addMoney("100.10", 0.2, BigInt(5)).toFixed(2)).toBe("105.30");
  });

  it("subtracts", () => {
    expect(subtractMoney("1000.00", "249.99").toFixed(2)).toBe("750.01");
  });

  it("returns zero for an empty sum", () => {
    expect(addMoney().toFixed(2)).toBe("0.00");
    expect(subtractMoney().toFixed(2)).toBe("0.00");
  });

  it("multiplies a price by an integer term without float error", () => {
    // 0.07 * 3 is 0.21000000000000002 in IEEE-754.
    expect(multiplyMoney("0.07", 3).toFixed(2)).toBe("0.21");
    expect(multiplyMoney("1250.50", 24).toFixed(2)).toBe("30012.00");
    expect(multiplyMoney("1000", 0).toFixed(2)).toBe("0.00");
  });

  it("handles a large but legal contract value", () => {
    expect(multiplyMoney("100000000.00", 120).toFixed(2)).toBe(
      "12000000000.00",
    );
  });
});

describe("isPositiveMoney / moneyEquals", () => {
  it("detects strictly positive amounts", () => {
    expect(isPositiveMoney("0.01")).toBe(true);
    expect(isPositiveMoney("0")).toBe(false);
    expect(isPositiveMoney("0.00")).toBe(false);
    expect(isPositiveMoney("-5")).toBe(false);
  });

  it("compares to the cent, ignoring scale", () => {
    expect(moneyEquals("1250", "1250.00")).toBe(true);
    expect(moneyEquals("1250.00", "1250.01")).toBe(false);
  });
});

describe("roundToScale", () => {
  it("rounds half-up to the storage scale", () => {
    expect(roundToScale("1.005").toFixed(2)).toBe("1.01");
    expect(roundToScale("1.004").toFixed(2)).toBe("1.00");
    expect(roundToScale("2.675").toFixed(2)).toBe("2.68");
  });
});

describe("parseAmountInput", () => {
  it("parses plain decimals", () => {
    expect(parseAmountInput("1250")?.toFixed(2)).toBe("1250.00");
    expect(parseAmountInput("1250.5")?.toFixed(2)).toBe("1250.50");
    expect(parseAmountInput(1250)?.toFixed(2)).toBe("1250.00");
  });

  it("tolerates whitespace and thousands separators from a pasted value", () => {
    expect(parseAmountInput(" 1,250.50 ")?.toFixed(2)).toBe("1250.50");
  });

  it("rejects anything that is not a plain decimal", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("   ")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("12.5.5")).toBeNull();
    expect(parseAmountInput("1e5")).toBeNull();
    expect(parseAmountInput("0x10")).toBeNull();
    expect(parseAmountInput(null)).toBeNull();
    expect(parseAmountInput(undefined)).toBeNull();
  });

  it("rejects more than two decimal places instead of rounding silently", () => {
    expect(parseAmountInput("10.005")).toBeNull();
  });
});

describe("formatEtb / formatEtbNumber", () => {
  it("groups thousands and appends the currency", () => {
    expect(formatEtbNumber("1234567.5")).toBe("1,234,567.50");
    expect(formatEtb("1234567.5")).toBe("1,234,567.50 ETB");
  });

  it("keeps two decimals for small amounts", () => {
    expect(formatEtbNumber("0.5")).toBe("0.50");
    expect(formatEtbNumber("7")).toBe("7.00");
  });

  it("does not re-round a large amount through a float division", () => {
    // 12,000,000,000.00 is exactly representable only as a decimal string.
    expect(formatEtbNumber("12000000000")).toBe("12,000,000,000.00");
  });

  it("renders zero", () => {
    expect(formatEtb("0")).toBe("0.00 ETB");
  });
});
