import { NextResponse } from "next/server";
import {
  getSsoSettings,
  getSamlLoginUrl,
  getOidcAuthorizationUrl,
} from "@/lib/sso";
import { logger } from "@/lib/logger";
import { getBaseUrl } from "@/lib/url";
import crypto from "crypto";

/**
 * GET /api/auth/sso-init
 * Initiates SSO login by redirecting to the configured IdP.
 */
export async function GET() {
  try {
    const settings = await getSsoSettings();

    if (!settings.enabled) {
      return NextResponse.json(
        { error: "SSO is not enabled" },
        { status: 400 },
      );
    }

    if (settings.provider === "saml") {
      const url = await getSamlLoginUrl();
      return NextResponse.redirect(url);
    } else {
      const state = crypto.randomBytes(16).toString("hex");
      const url = await getOidcAuthorizationUrl(state);
      const response = NextResponse.redirect(url);
      response.cookies.set("oidc_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 300,
        path: "/",
      });
      return response;
    }
  } catch (error: any) {
    logger.error("SSO init error", { error: error.message });
    return NextResponse.redirect(
      new URL(`/login?error=sso_init_failed`, getBaseUrl()),
    );
  }
}

export const dynamic = "force-dynamic";
