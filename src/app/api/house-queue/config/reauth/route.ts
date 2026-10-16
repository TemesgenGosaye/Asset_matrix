import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { verifyUserPassword } from "@/lib/auth-utils";
import { decrypt, decryptArray } from "@/lib/encryption";
import { verifyBackupCode, verifyMfaToken } from "@/lib/mfa";
import prisma from "@/lib/prisma";
import {
  createReauthProof,
  getReauthSecret,
  REAUTH_COOKIE,
  REAUTH_TTL_MS,
} from "@/lib/house-queue/config/reauth";

// POST /api/house-queue/config/reauth
// Body: { password, totpCode?, isBackupCode? }
//
// Re-verifies the user before ADMIN-only config publishes (weights /
// eligibility bands) or any rollback. On success issues a momentary,
// HMAC-signed, single-purpose proof cookie scoped to userId + organizationId.
export async function POST(req: NextRequest) {
  try {
    const requester = await requirePermission("house_queue:manage");
    requireNotDemoMode();
    const orgId = await requireOrgId();

    const requesterId = requester.id;
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const password = typeof body?.password === "string" ? body.password : "";
    const totpCode =
      typeof body?.totpCode === "string" && body.totpCode.trim()
        ? body.totpCode.trim()
        : undefined;
    const isBackupCode = body?.isBackupCode === true;

    if (!password) {
      return NextResponse.json(
        {
          error: "Password is required to confirm your identity",
          field: "password",
        },
        { status: 400 },
      );
    }

    const passwordValid = await verifyUserPassword(requesterId, password);
    if (!passwordValid) {
      return NextResponse.json(
        {
          error: "Incorrect password",
          field: "password",
        },
        { status: 403 },
      );
    }

    // Step-up MFA: when the user has a second factor enabled, the code is
    // required (TOTP or a backup code) in addition to the password.
    const user = await prisma.user.findUnique({
      where: { userid: requesterId },
      select: { mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true },
    });
    if (user?.mfaEnabled && user.mfaSecret) {
      if (!totpCode) {
        return NextResponse.json(
          {
            error:
              "Two-factor code required — your account has a second factor enabled",
            field: "totpCode",
          },
          { status: 400 },
        );
      }
      let codeValid = false;
      if (isBackupCode) {
        codeValid = verifyBackupCode(
          decryptArray(user.mfaBackupCodes),
          totpCode,
        ).valid;
      } else {
        codeValid = verifyMfaToken(decrypt(user.mfaSecret), totpCode);
      }
      if (!codeValid) {
        return NextResponse.json(
          {
            error: isBackupCode
              ? "That backup code is not valid"
              : "That verification code is not valid",
            field: "totpCode",
          },
          { status: 400 },
        );
      }
    }

    const proof = createReauthProof({
      userId: requesterId,
      organizationId: orgId,
      secret: getReauthSecret(),
    });

    const cookieStore = await cookies();
    cookieStore.set(REAUTH_COOKIE, proof, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(REAUTH_TTL_MS / 1000),
    });

    return NextResponse.json(
      { success: true, expiresInMs: REAUTH_TTL_MS },
      { status: 200 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/config/reauth",
      message: "Failed to verify your identity",
    });
  }
}

export const dynamic = "force-dynamic";
