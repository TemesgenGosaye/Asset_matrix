import { describe, it, expect } from "vitest";
import {
  ETHIOPIAN_PHONE_RULE,
  formatPhoneForDisplay,
  maskNationalId,
  NATIONAL_ID_RULE,
  normalizeEthiopianPhone,
  normalizePhoneList,
  validateNationalId,
} from "../validators";

describe("validateNationalId", () => {
  it("accepts digits within the length bounds and trims them", () => {
    expect(validateNationalId("123456789012")).toEqual({
      ok: true,
      value: "123456789012",
    });
    expect(validateNationalId("  123456789012  ")).toEqual({
      ok: true,
      value: "123456789012",
    });
  });

  it("accepts the inclusive bounds", () => {
    expect(validateNationalId("1".repeat(NATIONAL_ID_RULE.minLength)).ok).toBe(
      true,
    );
    expect(validateNationalId("1".repeat(NATIONAL_ID_RULE.maxLength)).ok).toBe(
      true,
    );
  });

  it("rejects non-digits", () => {
    expect(validateNationalId("123-456").ok).toBe(false);
    expect(validateNationalId("ABC123456").ok).toBe(false);
    expect(validateNationalId("1234 5678").ok).toBe(false);
    expect(validateNationalId("١٢٣٤").ok).toBe(false); // Arabic-Indic digits
  });

  it("rejects out-of-range lengths", () => {
    expect(
      validateNationalId("1".repeat(NATIONAL_ID_RULE.minLength - 1)).ok,
    ).toBe(false);
    expect(
      validateNationalId("1".repeat(NATIONAL_ID_RULE.maxLength + 1)).ok,
    ).toBe(false);
  });

  it("requires a value", () => {
    expect(validateNationalId("").ok).toBe(false);
    expect(validateNationalId("   ").ok).toBe(false);
    expect(validateNationalId(null).ok).toBe(false);
    expect(validateNationalId(undefined).ok).toBe(false);
  });

  it("gives every rejection a message the form can display", () => {
    for (const bad of ["", "abc", "1"]) {
      const result = validateNationalId(bad);
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    }
  });
});

describe("maskNationalId", () => {
  it("keeps only the last four characters", () => {
    expect(maskNationalId("123456789012")).toBe("********9012");
  });

  it("leaves a short value alone", () => {
    expect(maskNationalId("1234")).toBe("1234");
    expect(maskNationalId("12")).toBe("12");
  });

  it("renders an empty value as an empty string", () => {
    expect(maskNationalId("")).toBe("");
    expect(maskNationalId(null)).toBe("");
    expect(maskNationalId(undefined)).toBe("");
  });

  it("never leaks the leading digits", () => {
    const masked = maskNationalId("987654321012");
    expect(masked.startsWith("9")).toBe(false);
    expect(masked).not.toContain("9876");
  });
});

describe("normalizeEthiopianPhone", () => {
  it("normalises the local 09 form", () => {
    expect(normalizeEthiopianPhone("0912345678").value).toBe("+251912345678");
  });

  it("normalises the local 07 form", () => {
    expect(normalizeEthiopianPhone("0712345678").value).toBe("+251712345678");
  });

  it("normalises the international form with and without '+'", () => {
    expect(normalizeEthiopianPhone("+251912345678").value).toBe(
      "+251912345678",
    );
    expect(normalizeEthiopianPhone("251912345678").value).toBe("+251912345678");
    expect(normalizeEthiopianPhone("00251912345678").value).toBe(
      "+251912345678",
    );
  });

  it("normalises a bare national significant number", () => {
    expect(normalizeEthiopianPhone("912345678").value).toBe("+251912345678");
    expect(normalizeEthiopianPhone("712345678").value).toBe("+251712345678");
  });

  it("strips the separators humans actually type", () => {
    for (const input of [
      "+251 91 234 5678",
      "+251-91-234-5678",
      "091 234 5678",
      "(0912) 345-678",
      " 0912.345.678 ",
    ]) {
      expect(normalizeEthiopianPhone(input).value).toBe("+251912345678");
    }
  });

  it("rejects a number with the wrong length", () => {
    expect(normalizeEthiopianPhone("091234567").ok).toBe(false); // 9 national digits
    expect(normalizeEthiopianPhone("09123456789").ok).toBe(false); // 11
  });

  it("rejects a non-Ethiopian country code", () => {
    expect(normalizeEthiopianPhone("+12025550123").ok).toBe(false);
    expect(normalizeEthiopianPhone("02025550123").ok).toBe(false);
  });

  it("rejects a landline-style local prefix", () => {
    // Ethiopian fixed lines are not mobile; this module accepts mobiles only.
    expect(normalizeEthiopianPhone("0112345678").ok).toBe(false);
  });

  it("rejects letters and empty input", () => {
    expect(normalizeEthiopianPhone("0912345abc").ok).toBe(false);
    expect(normalizeEthiopianPhone("").ok).toBe(false);
    expect(normalizeEthiopianPhone("   ").ok).toBe(false);
    expect(normalizeEthiopianPhone(null).ok).toBe(false);
  });

  it("gives every rejection the shared message", () => {
    expect(normalizeEthiopianPhone("abc").message).toBe(
      ETHIOPIAN_PHONE_RULE.message,
    );
  });

  it("produces a value that satisfies the database E.164 CHECK", () => {
    // Mirrors rent_renter_phones_e164_check: ^\+[1-9][0-9]{9,14}$
    const dbCheck = /^\+[1-9][0-9]{9,14}$/;
    for (const input of [
      "0912345678",
      "+251 91 234 5678",
      "0712345678",
      "912345678",
    ]) {
      const result = normalizeEthiopianPhone(input);
      expect(result.ok).toBe(true);
      expect(dbCheck.test(result.value!)).toBe(true);
    }
  });
});

describe("formatPhoneForDisplay", () => {
  it("groups an Ethiopian number for readability", () => {
    expect(formatPhoneForDisplay("+251912345678")).toBe("+251 91 234 5678");
  });

  it("falls back to the raw value for an unexpected number", () => {
    expect(formatPhoneForDisplay("+12025550123")).toBe("+12025550123");
  });

  it("renders an em dash for a missing value", () => {
    expect(formatPhoneForDisplay(null)).toBe("—");
    expect(formatPhoneForDisplay("")).toBe("—");
  });
});

describe("normalizePhoneList", () => {
  it("normalises a list and picks the primary", () => {
    const result = normalizePhoneList([
      { phone: "0912345678", isPrimary: false },
      { phone: "0712345678", isPrimary: true },
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.values).toEqual(["+251912345678", "+251712345678"]);
    expect(result.primary).toBe("+251712345678");
  });

  it("defaults the primary to the first entry when none is flagged", () => {
    const result = normalizePhoneList([
      { phone: "0912345678", isPrimary: false },
      { phone: "0712345678", isPrimary: false },
    ]);
    expect(result.primary).toBe("+251912345678");
  });

  it("requires at least one phone", () => {
    const result = normalizePhoneList([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/at least one/i);
  });

  it("treats blank entries as absent", () => {
    const result = normalizePhoneList([
      { phone: "0912345678", isPrimary: true },
      { phone: "   ", isPrimary: false },
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.values).toEqual(["+251912345678"]);
  });

  it("allows up to three phones", () => {
    const result = normalizePhoneList([
      { phone: "0912345678", isPrimary: true },
      { phone: "0712345678", isPrimary: false },
      { phone: "0912345679", isPrimary: false },
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.values).toHaveLength(3);
  });

  it("rejects a fourth phone", () => {
    const result = normalizePhoneList([
      { phone: "0912345678", isPrimary: true },
      { phone: "0712345678", isPrimary: false },
      { phone: "0912345679", isPrimary: false },
      { phone: "0712345679", isPrimary: false },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/at most 3/i);
  });

  it("rejects duplicates rather than silently collapsing them", () => {
    const result = normalizePhoneList([
      { phone: "0912345678", isPrimary: true },
      { phone: "+251 91 234 5678", isPrimary: false },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/already listed/i);
  });

  it("reports the offending index so the form can highlight it", () => {
    const result = normalizePhoneList([
      { phone: "0912345678", isPrimary: true },
      { phone: "not-a-number", isPrimary: false },
    ]);
    expect(result.errors[0].index).toBe(1);
  });

  it("accepts a bare string list", () => {
    const result = normalizePhoneList(["0912345678"]);
    expect(result.errors).toHaveLength(0);
    expect(result.values).toEqual(["+251912345678"]);
  });
});
