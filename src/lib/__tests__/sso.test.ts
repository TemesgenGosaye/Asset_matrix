import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { system_settings: { findMany: vi.fn() } },
}));
vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn((val: string) => `decrypted_${val}`),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@node-saml/node-saml", () => ({
  SAML: vi.fn().mockImplementation(() => ({
    getAuthorizeUrlAsync: vi
      .fn()
      .mockResolvedValue(
        "https://idp.example.com/saml/login?SAMLRequest=xxx",
      ),
    validatePostResponseAsync: vi.fn().mockResolvedValue({
      profile: {
        nameID: "jdoe@example.com",
        email: "jdoe@example.com",
        firstName: "John",
        lastName: "Doe",
      },
    }),
  })),
}));

import prisma from "@/lib/prisma";
import { getSsoSettings, getSamlLoginUrl, getOidcAuthorizationUrl } from "@/lib/sso";

const mockPrisma = prisma as any;

function mockSsoSettings(
  overrides: Array<{ key: string; value: string; encrypted?: boolean }>,
) {
  mockPrisma.system_settings.findMany.mockResolvedValue(
    overrides.map((o, i) => ({
      id: String(i),
      settingKey: o.key,
      settingValue: o.value,
      settingType: "string",
      category: "sso",
      isEncrypted: o.encrypted || false,
      updatedAt: new Date(),
    })) as any,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getSsoSettings
// ---------------------------------------------------------------------------
describe("getSsoSettings", () => {
  it("returns defaults when no settings exist", async () => {
    mockPrisma.system_settings.findMany.mockResolvedValue([]);

    const settings = await getSsoSettings();

    expect(settings.enabled).toBe(false);
    expect(settings.provider).toBe("saml");
    expect(settings.scopes).toBe("openid profile email");
    expect(settings.attrEmail).toBe("email");
    expect(settings.attrFirstName).toBe("firstName");
    expect(settings.attrLastName).toBe("lastName");
    expect(settings.attrUsername).toBe("username");
  });

  it("reads and returns correct values from DB", async () => {
    mockSsoSettings([
      { key: "sso.enabled", value: "true" },
      { key: "sso.provider", value: "oidc" },
      { key: "sso.providerName", value: "Okta" },
      { key: "sso.clientId", value: "my-client-id" },
      { key: "sso.authorizationUrl", value: "https://okta.example.com/authorize" },
      { key: "sso.tokenUrl", value: "https://okta.example.com/token" },
      { key: "sso.scopes", value: "openid email" },
    ]);

    const settings = await getSsoSettings();

    expect(settings.enabled).toBe(true);
    expect(settings.provider).toBe("oidc");
    expect(settings.providerName).toBe("Okta");
    expect(settings.clientId).toBe("my-client-id");
    expect(settings.authorizationUrl).toBe("https://okta.example.com/authorize");
    expect(settings.scopes).toBe("openid email");
  });

  it("decrypts encrypted values", async () => {
    mockSsoSettings([
      { key: "sso.clientSecret", value: "enc_secret_123", encrypted: true },
      { key: "sso.certificate", value: "enc_cert_456", encrypted: true },
    ]);

    const settings = await getSsoSettings();

    expect(settings.clientSecret).toBe("decrypted_enc_secret_123");
    expect(settings.certificate).toBe("decrypted_enc_cert_456");
  });
});

// ---------------------------------------------------------------------------
// getSamlLoginUrl
// ---------------------------------------------------------------------------
describe("getSamlLoginUrl", () => {
  it("throws when SSO is not enabled", async () => {
    mockSsoSettings([
      { key: "sso.enabled", value: "false" },
      { key: "sso.provider", value: "saml" },
    ]);

    await expect(getSamlLoginUrl()).rejects.toThrow("SAML SSO is not enabled");
  });
});

// ---------------------------------------------------------------------------
// getOidcAuthorizationUrl
// ---------------------------------------------------------------------------
describe("getOidcAuthorizationUrl", () => {
  it("builds correct URL with query params", async () => {
    mockSsoSettings([
      { key: "sso.enabled", value: "true" },
      { key: "sso.provider", value: "oidc" },
      { key: "sso.clientId", value: "client-abc" },
      { key: "sso.authorizationUrl", value: "https://idp.example.com/authorize" },
      { key: "sso.scopes", value: "openid profile email" },
    ]);

    const url = await getOidcAuthorizationUrl("state-xyz");
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://idp.example.com");
    expect(parsed.pathname).toBe("/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("client-abc");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe("openid profile email");
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    expect(parsed.searchParams.get("redirect_uri")).toContain(
      "/api/auth/callback/oidc",
    );
  });

  it("throws when OIDC is not enabled", async () => {
    mockSsoSettings([
      { key: "sso.enabled", value: "true" },
      { key: "sso.provider", value: "saml" },
    ]);

    await expect(getOidcAuthorizationUrl("state-xyz")).rejects.toThrow(
      "OIDC SSO is not enabled",
    );
  });
});
