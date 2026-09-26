import { describe, it, expect } from "vitest";
import {
  validatePasswordComplexity,
  getPasswordStrengthLabel,
  getPasswordStrengthColor,
  passwordsMatch,
  getPasswordRequirements,
  PASSWORD_CONFIG,
  passwordSchema,
  passwordWithConfirmationSchema,
} from "../password-validation";

describe("validatePasswordComplexity", () => {
  it("rejects passwords shorter than minLength", () => {
    const result = validatePasswordComplexity("Ab1!");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects password without uppercase", () => {
    const result = validatePasswordComplexity("lowercase123!");
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/uppercase/i)]),
    );
  });

  it("rejects password without lowercase", () => {
    const result = validatePasswordComplexity("UPPERCASE123!");
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/lowercase/i)]),
    );
  });

  it("rejects password without number", () => {
    const result = validatePasswordComplexity("NoNumbers!!");
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/number/i)]),
    );
  });

  it("rejects password without special character", () => {
    const result = validatePasswordComplexity("NoSpecial123");
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/special/i)]),
    );
  });

  it("accepts a strong password", () => {
    const result = validatePasswordComplexity("Str0ng!Pass#2026");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("detects common passwords", () => {
    const result = validatePasswordComplexity("password");
    expect(result.valid).toBe(false);
  });

  it("returns score between 0 and 4", () => {
    const weak = validatePasswordComplexity("a");
    const strong = validatePasswordComplexity("V3ry$tr0ng!P@ss");
    expect(weak.score).toBeGreaterThanOrEqual(0);
    expect(strong.score).toBeLessThanOrEqual(4);
  });
});

describe("getPasswordStrengthLabel", () => {
  it("returns correct labels for each score", () => {
    expect(getPasswordStrengthLabel(0)).toBe("Very Weak");
    expect(getPasswordStrengthLabel(1)).toBe("Weak");
    expect(getPasswordStrengthLabel(2)).toBe("Fair");
    expect(getPasswordStrengthLabel(3)).toBe("Strong");
    expect(getPasswordStrengthLabel(4)).toBe("Very Strong");
  });
});

describe("getPasswordStrengthColor", () => {
  it("returns a color string for each score", () => {
    for (let i = 0; i <= 4; i++) {
      const color = getPasswordStrengthColor(i);
      expect(typeof color).toBe("string");
      expect(color.length).toBeGreaterThan(0);
    }
  });
});

describe("passwordsMatch", () => {
  it("returns true for matching passwords", () => {
    expect(passwordsMatch("test123", "test123")).toBe(true);
  });

  it("returns false for non-matching passwords", () => {
    expect(passwordsMatch("test123", "test456")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(passwordsMatch("Test", "test")).toBe(false);
  });
});

describe("getPasswordRequirements", () => {
  it("returns an array of requirement strings", () => {
    const reqs = getPasswordRequirements();
    expect(Array.isArray(reqs)).toBe(true);
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs.every((r) => typeof r === "string")).toBe(true);
  });
});

describe("PASSWORD_CONFIG", () => {
  it("has expected default values", () => {
    expect(PASSWORD_CONFIG.minLength).toBe(8);
    expect(PASSWORD_CONFIG.maxLength).toBe(128);
    expect(PASSWORD_CONFIG.requireUppercase).toBe(true);
    expect(PASSWORD_CONFIG.requireLowercase).toBe(true);
    expect(PASSWORD_CONFIG.requireNumber).toBe(true);
    expect(PASSWORD_CONFIG.requireSpecial).toBe(true);
  });

  it("has a common passwords list", () => {
    expect(Array.isArray(PASSWORD_CONFIG.commonPasswords)).toBe(true);
    expect(PASSWORD_CONFIG.commonPasswords.length).toBeGreaterThan(0);
    expect(PASSWORD_CONFIG.commonPasswords).toContain("password");
  });
});

describe("passwordSchema (Zod)", () => {
  it("accepts a valid password", () => {
    const result = passwordSchema.safeParse("Str0ng!Pass#");
    expect(result.success).toBe(true);
  });

  it("rejects a too-short password", () => {
    const result = passwordSchema.safeParse("Ab1!");
    expect(result.success).toBe(false);
  });
});

describe("passwordWithConfirmationSchema (Zod)", () => {
  it("accepts matching valid passwords", () => {
    const result = passwordWithConfirmationSchema.safeParse({
      password: "Str0ng!Pass#",
      confirmPassword: "Str0ng!Pass#",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-matching passwords", () => {
    const result = passwordWithConfirmationSchema.safeParse({
      password: "Str0ng!Pass#",
      confirmPassword: "Different1!",
    });
    expect(result.success).toBe(false);
  });
});
