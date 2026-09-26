import prisma from "../../../../lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePermission, requireNotDemoMode } from "@/lib/api-auth";
import { getOrganizationContext } from "@/lib/organization-context";
import { hashPassword } from "@/lib/auth-utils";
import { createUserSchema } from "@/lib/validation";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";
import { triggerWebhook } from "@/lib/webhooks";
import { notifyIntegrations } from "@/lib/integrations/slack-teams";
import { sendSetPasswordLink } from "@/lib/magic-link";
import { invalidateCacheByPrefix } from "@/lib/cache";
import crypto from "crypto";
import { logger, logCatchError } from "@/lib/logger";
import { getBaseUrl } from "@/lib/url";

// POST /api/user/addUser
export async function POST(request) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    // Require user:create permission
    const admin = await requirePermission("user:create");

    const body = await request.json();

    // An empty-string password (sent by the create form before a password is
    // generated) must be treated as "no password" — otherwise it fails the
    // password min-length rule and turns "generate password" mode into a 400.
    if (typeof body.password === "string" && body.password.trim() === "") {
      delete body.password;
    }

    // Validate input using Zod schema
    const validationResult = createUserSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    const {
      username,
      isadmin = false,
      canrequest = true,
      lastname,
      firstname,
      email,
      lan,
      password,
      passwordMode = "manual",
      accessExpiresAt,
    } = validationResult.data;

    // Email is required for every password mode. `user.email` is NOT NULL and
    // unique in the database, and BetterAuth login resolves identities through
    // email — an email-less account can never sign in. Rejecting early with a
    // clear message also prevents a 500 from the database NOT NULL constraint.
    if (!email || email.trim() === "") {
      return NextResponse.json(
        { error: "Email is required to create a user" },
        { status: 400 },
      );
    }

    // Normalize email — BetterAuth sign-in always lowercases the lookup email,
    // so storing mixed-case emails makes those accounts impossible to log into.
    const normalizedEmail = email.trim().toLowerCase();

    // Resolve the account password:
    //  - manual mode: the admin-typed password
    //  - generate mode: the client-generated password if one was sent
    //    (the create form generates + displays it), otherwise generate one
    //    server-side so the account is always usable.
    let finalPassword = password ?? null;
    let generatedPassword: string | null = null;
    if (passwordMode === "generate" && !finalPassword) {
      const chars =
        "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
      generatedPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => chars[b % chars.length])
        .join("");
      finalPassword = generatedPassword;
    }

    // Hash password (skip for invite-only)
    const hashedPassword = finalPassword
      ? await hashPassword(finalPassword)
      : null;

    // Get organization context for the creating admin
    const orgContext = await getOrganizationContext();

    // Create user
    const created = await prisma.user.create({
      data: {
        username: username ?? null,
        isadmin: Boolean(isadmin),
        canrequest: Boolean(canrequest),
        lastname,
        firstname,
        email: normalizedEmail,
        lan: lan ?? null,
        password: hashedPassword,
        creation_date: new Date(),
        organizationId: orgContext?.organization?.id || null,
        accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
      } as Prisma.userUncheckedCreateInput,
    });

    // Create credential account if password was set
    if (hashedPassword) {
      await prisma.accounts.upsert({
        where: {
          providerId_accountId: {
            providerId: "credential",
            accountId: created.userid,
          },
        },
        update: { password: hashedPassword },
        create: {
          userId: created.userid,
          providerId: "credential",
          accountId: created.userid,
          issuer: "local:credential",
          password: hashedPassword,
        },
      });
    }

    // Send magic link for generate/manual modes (if email exists)
    let magicLinkSent = false;
    if (passwordMode !== "invite") {
      magicLinkSent = await sendSetPasswordLink({
        userId: created.userid,
        email: normalizedEmail,
        userName: `${firstname} ${lastname}`.trim(),
        organizationName: orgContext?.organization?.name,
      });
    }

    // For invite mode, create a team invitation
    if (passwordMode === "invite" && orgContext?.organization?.id) {
      const inviteToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.teamInvitation.create({
        data: {
          email: normalizedEmail,
          organizationId: orgContext.organization.id,
          invitedBy: admin.id!,
          token: inviteToken,
          status: "pending",
          expiresAt,
        },
      });

      // Send invitation email
      try {
        const { renderTemplate, emailTemplates } =
          await import("@/lib/email/templates");
        const { sendEmail } = await import("@/lib/email/service");
        const baseUrl = getBaseUrl();
        const inviteUrl = `${baseUrl}/invite/${inviteToken}`;

        const subject = renderTemplate(emailTemplates.teamInvitation.subject, {
          organizationName: orgContext.organization.name,
        });
        const html = renderTemplate(emailTemplates.teamInvitation.html, {
          inviterName:
            `${(admin as any).firstname || ""} ${(admin as any).lastname || ""}`.trim() ||
            "Admin",
          organizationName: orgContext.organization.name,
          inviteUrl,
        });
        await sendEmail({ to: normalizedEmail, subject, html });
        magicLinkSent = true;
      } catch (emailError) {
        logger.warn("Failed to send invitation email during user creation", {
          error: emailError,
        });
      }
    }

    // Invalidate the cached user list so the /user page reflects the new user.
    await invalidateCacheByPrefix("users:");

    // Create audit log
    await createAuditLog({
      userId: admin.id,
      action: AUDIT_ACTIONS.CREATE,
      entity: AUDIT_ENTITIES.USER,
      entityId: created.userid,
      details: {
        username: created.username,
        isadmin: created.isadmin,
        canrequest: created.canrequest,
        passwordMode,
      },
    });

    triggerWebhook(
      "user.created",
      { userId: created.userid, email: created.email },
      created.organizationId,
    ).catch(() => {});
    notifyIntegrations("user.created", {
      email: created.email,
    }).catch(logCatchError("Integration notification failed"));

    // Remove password from response
    const { password: _, ...userWithoutPassword } = created;

    return NextResponse.json(
      {
        ...userWithoutPassword,
        ...(generatedPassword && { generatedPassword }),
        magicLinkSent,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("POST /api/user/addUser error", { error });

    // Handle specific error types
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    // Handle unique constraint violations
    if (error instanceof Object && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        {
          error: "A user with this username or email already exists",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );
  }
}
