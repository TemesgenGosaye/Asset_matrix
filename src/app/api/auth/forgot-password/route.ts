import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { sendEmail, queueEmail, emailTemplates, renderTemplate } from "@/lib/email";
import { requireNotDemoMode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getBaseUrl } from "@/lib/url";

export async function POST(req: Request) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        {
          message:
            "If an account with that email exists, we've sent a password reset link.",
        },
        { status: 200 },
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
    });

    if (user) {
      // Delete any existing tokens for this user
      await prisma.verification.deleteMany({
        where: { identifier: user.email! },
      });

      // Generate token
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.verification.create({
        data: {
          identifier: user.email!,
          value: token,
          expiresAt,
        },
      });

      // Build reset URL
      const baseUrl = getBaseUrl();
      const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email!)}`;

      // Send email directly (with queue fallback)
      const html = renderTemplate(emailTemplates.passwordReset.html, {
        resetUrl,
      });
      const subject = emailTemplates.passwordReset.subject;

      const result = await sendEmail({
        to: user.email!,
        subject,
        html,
      });

      if (!result.success) {
        logger.error("Direct email send failed, queuing instead", {
          error: result.error,
        });
        await queueEmail(
          user.userid,
          "password_reset",
          user.email!,
          subject,
          html,
        );
      }
    }

    // Always return same response to prevent email enumeration
    return NextResponse.json(
      {
        message:
          "If an account with that email exists, we've sent a password reset link.",
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("POST /api/auth/forgot-password error", { error });
    return NextResponse.json(
      {
        message:
          "If an account with that email exists, we've sent a password reset link.",
      },
      { status: 200 },
    );
  }
}

export const dynamic = "force-dynamic";
