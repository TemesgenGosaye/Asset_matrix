# User Onboarding Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add generate-password + magic link, invite-only mode, and configurable SSO providers (Microsoft Entra ID, Google, GitHub, Apple) to the user creation and login flows.

**Architecture:** Three independent feature tracks: (1) Magic link "set password" flow using the existing `verification` table for token storage and existing email service for delivery; (2) Unified "Add User" form with radio group selecting between generate-password, manual-password, and invite-only modes; (3) Configurable social SSO providers using BetterAuth's built-in social plugins with encrypted config stored in `system_settings`, admin UI in the existing SSO settings tab, and dynamic provider buttons on the login page.

**Tech Stack:** Next.js 15 App Router, BetterAuth v1.5.3, Prisma (PostgreSQL), Zod, shadcn/ui, bcryptjs, existing email service (Brevo/SendGrid/etc.)

---

## Track A: Magic Link "Set Password" Flow

### Task 1: Add `setPassword` Email Template

**Files:**

- Modify: `src/lib/email/templates.ts`

**Step 1: Add the template**

Add a new `setPassword` template to the `emailTemplates` object in `src/lib/email/templates.ts`, after the existing `passwordReset` template (line ~219). Pattern matches the existing `teamInvitation` template style:

```typescript
setPassword: {
  subject: "Set Your Password - Asset Tracker",
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Asset Tracker</h2>
      <p>Hello {{userName}},</p>
      <p>An account has been created for you at <strong>{{organizationName}}</strong>. Please set your password to get started.</p>
      <p style="margin: 30px 0;">
        <a href="{{setPasswordUrl}}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Set Your Password</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #2563eb;">{{setPasswordUrl}}</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">This link expires in 72 hours. If you didn't expect this email, you can safely ignore it.</p>
      <p>Best regards,<br>Asset Tracker System</p>
    </div>
  `,
},
```

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to templates.ts

**Step 3: Commit**

```bash
git add src/lib/email/templates.ts
git commit -m "feat: add setPassword email template for magic link flow"
```

---

### Task 2: Create Set-Password API Endpoint

**Files:**

- Create: `src/app/api/auth/set-password/route.ts`

**Step 1: Create the API route**

Create `src/app/api/auth/set-password/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth-utils";
import { z } from "zod";
import { logger } from "@/lib/logger";

const setPasswordSchema = z.object({
  token: z.string().uuid(),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(100),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { token, password } = parsed.data;

    // Look up token in verification table
    const verification = await prisma.verification.findFirst({
      where: {
        value: token,
        identifier: { startsWith: "set-password:" },
      },
    });

    if (!verification) {
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 400 },
      );
    }

    // Check expiry
    if (new Date() > new Date(verification.expiresAt)) {
      // Clean up expired token
      await prisma.verification.delete({ where: { id: verification.id } });
      return NextResponse.json(
        {
          error:
            "This link has expired. Please ask your administrator to send a new one.",
        },
        { status: 400 },
      );
    }

    // Extract userId from identifier (format: "set-password:{userId}")
    const userId = verification.identifier.replace("set-password:", "");

    // Hash and update password
    const hashedPassword = await hashPassword(password);

    await prisma.user.update({
      where: { userid: userId },
      data: { password: hashedPassword },
    });

    // Upsert credential account so BetterAuth can authenticate
    await prisma.accounts.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: userId,
        },
      },
      update: { password: hashedPassword },
      create: {
        userId: userId,
        providerId: "credential",
        accountId: userId,
        password: hashedPassword,
      },
    });

    // Delete the used token (single-use)
    await prisma.verification.delete({ where: { id: verification.id } });

    logger.info("User set password via magic link", { userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("POST /api/auth/set-password error", { error });
    return NextResponse.json(
      { error: "Failed to set password" },
      { status: 500 },
    );
  }
}
```

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/auth/set-password/route.ts
git commit -m "feat: add POST /api/auth/set-password endpoint for magic link tokens"
```

---

### Task 3: Create Set-Password Page

**Files:**

- Create: `src/app/set-password/[token]/page.tsx`

**Step 1: Create the page**

Create `src/app/set-password/[token]/page.tsx`. This is a public page (no auth required). Pattern matches the existing invite accept page at `src/app/invite/[token]/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to set password");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Password Set</CardTitle>
            <CardDescription>
              Your password has been set successfully. You can now sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push("/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            Set Your Password
          </CardTitle>
          <CardDescription>
            Choose a password for your Asset Tracker account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 12 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                minLength={12}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            {error && (
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Setting password..." : "Set Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/set-password/
git commit -m "feat: add set-password page for magic link flow"
```

---

### Task 4: Create Magic Link Helper Function

**Files:**

- Create: `src/lib/magic-link.ts`

**Step 1: Create the helper**

This function creates a verification token and sends the set-password email. It will be called from the addUser API.

```typescript
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/service";
import { emailTemplates, renderTemplate } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

/**
 * Create a "set password" magic link token and send the email.
 * @returns true if email was sent successfully
 */
export async function sendSetPasswordLink(params: {
  userId: string;
  email: string;
  userName: string;
  organizationName?: string;
}): Promise<boolean> {
  const { userId, email, userName, organizationName } = params;

  // Generate token
  const token = crypto.randomUUID();

  // Store in verification table (72-hour expiry)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 72);

  await prisma.verification.create({
    data: {
      identifier: `set-password:${userId}`,
      value: token,
      expiresAt,
    },
  });

  // Build URL
  const baseUrl =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const setPasswordUrl = `${baseUrl}/set-password/${token}`;

  // Send email
  try {
    const subject = renderTemplate(emailTemplates.setPassword.subject, {});
    const html = renderTemplate(emailTemplates.setPassword.html, {
      userName,
      organizationName: organizationName || "Asset Tracker",
      setPasswordUrl,
    });

    const result = await sendEmail({ to: email, subject, html });
    if (!result.success) {
      logger.warn("Failed to send set-password email", {
        userId,
        error: result.error,
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn("Failed to send set-password email", { userId, error });
    return false;
  }
}
```

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/magic-link.ts
git commit -m "feat: add sendSetPasswordLink helper for magic link flow"
```

---

## Track B: Unified "Add User" Form

### Task 5: Update Validation Schema and addUser API

**Files:**

- Modify: `src/lib/validation.ts` (line 14–23)
- Modify: `src/app/api/user/addUser/route.ts`

**Step 1: Update the Zod schema**

In `src/lib/validation.ts`, change `createUserSchema` so `password` is optional (for invite-only and generate modes):

```typescript
export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().nullable().optional(),
  firstname: z.string().min(1).max(100),
  lastname: z.string().min(1).max(100),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100)
    .optional(),
  isadmin: z.boolean().default(false),
  canrequest: z.boolean().default(false),
  lan: z.string().max(50).nullable().optional(),
  passwordMode: z.enum(["generate", "manual", "invite"]).default("manual"),
});
```

**Step 2: Update the addUser API**

In `src/app/api/user/addUser/route.ts`, modify the POST handler to support three modes:

1. **`manual`** (current behavior): hash and store provided password, send magic link if email exists
2. **`generate`**: generate random 16-char password, hash and store it, send magic link (requires email)
3. **`invite`**: no password, create TeamInvitation and send invitation email (requires email)

Replace the password handling logic (lines 47–78) with:

```typescript
import { sendSetPasswordLink } from "@/lib/magic-link";
import crypto from "crypto";

// ... inside POST handler, after validation ...

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
} = validationResult.data;

// Modes that need email
if (passwordMode !== "manual" && !email) {
  return NextResponse.json(
    { error: "Email is required for this password mode" },
    { status: 400 },
  );
}

// Generate password if needed
let finalPassword = password;
let generatedPassword: string | null = null;
if (passwordMode === "generate") {
  const chars =
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  generatedPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => chars[b % chars.length])
    .join("");
  finalPassword = generatedPassword;
}

// Hash password (skip for invite-only)
const hashedPassword = finalPassword ? await hashPassword(finalPassword) : null;

// Create user
const created = await prisma.user.create({
  data: {
    username: username ?? null,
    isadmin: Boolean(isadmin),
    canrequest: Boolean(canrequest),
    lastname,
    firstname,
    email: email ?? null,
    lan: lan ?? null,
    password: hashedPassword,
    creation_date: new Date(),
    organizationId: orgContext?.organization?.id || null,
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
      password: hashedPassword,
    },
  });
}

// Send magic link for generate/manual modes (if email exists)
let magicLinkSent = false;
if (passwordMode !== "invite" && email) {
  magicLinkSent = await sendSetPasswordLink({
    userId: created.userid,
    email,
    userName: `${firstname} ${lastname}`.trim(),
    organizationName: orgContext?.organization?.name,
  });
}

// For invite mode, create a team invitation
if (passwordMode === "invite" && email && orgContext?.organization?.id) {
  const inviteToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.teamInvitation.create({
    data: {
      email: email.toLowerCase(),
      organizationId: orgContext.organization.id,
      invitedBy: admin.id,
      token: inviteToken,
      status: "pending",
      expiresAt,
    },
  });

  // Send invitation email
  try {
    const { renderTemplate } = await import("@/lib/email/templates");
    const { emailTemplates } = await import("@/lib/email/templates");
    const { sendEmail } = await import("@/lib/email/service");
    const baseUrl =
      process.env.BETTER_AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite/${inviteToken}`;

    const subject = renderTemplate(emailTemplates.teamInvitation.subject, {
      organizationName: orgContext.organization.name,
    });
    const html = renderTemplate(emailTemplates.teamInvitation.html, {
      inviterName:
        `${admin.firstname || ""} ${admin.lastname || ""}`.trim() || "Admin",
      organizationName: orgContext.organization.name,
      inviteUrl,
    });
    await sendEmail({ to: email.toLowerCase(), subject, html });
  } catch (emailError) {
    logger.warn("Failed to send invitation email during user creation", {
      error: emailError,
    });
  }
}
```

Update the response to include `generatedPassword` and `magicLinkSent`:

```typescript
const { password: _, ...userWithoutPassword } = created;
return NextResponse.json(
  {
    ...userWithoutPassword,
    ...(generatedPassword && { generatedPassword }),
    magicLinkSent,
  },
  { status: 201 },
);
```

**Step 3: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/validation.ts src/app/api/user/addUser/route.ts
git commit -m "feat: support generate/manual/invite password modes in addUser API"
```

---

### Task 6: Update Create User Page UI

**Files:**

- Modify: `src/app/user/create/page.tsx`

**Step 1: Redesign the Security section**

Replace the entire Security section (lines 211–221) with a radio group for password mode selection. Add state for `passwordMode`, `generatedPassword`, and `magicLinkSent`. Update form submission to pass `passwordMode` and handle the response.

Key UI changes:

1. Add `passwordMode` to form state (default: `"generate"`)
2. Add `generatedPassword` state for displaying the generated password
3. Radio group with three options: "Generate password" (recommended), "Set manually", "Invite only"
4. Generate mode: "Generate" button + readonly input + copy button. Email required.
5. Manual mode: current password input. Email optional.
6. Invite mode: hides password fields entirely, shows info text. Email required.
7. Make password field `required` only when `passwordMode === "manual"`
8. On successful create with generate mode: show generated password in a success toast/dialog
9. Show "Magic link sent" confirmation when `magicLinkSent` is true

The full component replacement is large — implement it by:

1. Adding imports: `import { Copy, Check, RefreshCw } from "lucide-react"` and `import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"`
2. Adding state vars: `passwordMode`, `generatedPassword`, `copied`
3. Replacing the Security `<section>` with the radio group + conditional fields
4. Updating `onSubmit` to send `passwordMode` and handle `generatedPassword` in response
5. Making `password` not `required` in the HTML when mode is not `"manual"`

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/user/create/page.tsx
git commit -m "feat: unified Add User form with generate/manual/invite password modes"
```

---

## Track C: Configurable SSO Providers

### Task 7: Install BetterAuth Social Provider Dependencies

**Step 1: Install**

BetterAuth includes social provider support built-in (no extra packages needed). Verify:

Run: `grep -r "socialProviders\|microsoft\|google.*better-auth" node_modules/better-auth/dist/ | head -5`

If social providers are built-in, no install needed. If separate packages exist, install them.

**Step 2: Commit (if package.json changed)**

```bash
git add package.json bun.lockb
git commit -m "chore: add social provider dependencies"
```

---

### Task 8: Create SSO Provider Configuration API

**Files:**

- Create: `src/app/api/admin/settings/sso-providers/route.ts`
- Create: `src/lib/sso-providers.ts`

**Step 1: Create the provider config helper**

Create `src/lib/sso-providers.ts` — reads/writes SSO provider configs from `system_settings` table with encryption, following the same pattern as the existing `src/lib/sso.ts`:

```typescript
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

export interface SsoProviderConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  // Microsoft-specific
  tenantId?: string;
  // Apple-specific
  teamId?: string;
  keyId?: string;
  privateKey?: string;
}

export type SsoProviderType = "microsoft" | "google" | "github" | "apple";

const PROVIDER_KEYS: Record<SsoProviderType, string[]> = {
  microsoft: ["enabled", "clientId", "clientSecret", "tenantId"],
  google: ["enabled", "clientId", "clientSecret"],
  github: ["enabled", "clientId", "clientSecret"],
  apple: [
    "enabled",
    "clientId",
    "clientSecret",
    "teamId",
    "keyId",
    "privateKey",
  ],
};

const ENCRYPTED_FIELDS = ["clientSecret", "privateKey"];

export async function getSsoProviderConfig(
  provider: SsoProviderType,
): Promise<SsoProviderConfig> {
  const keys = PROVIDER_KEYS[provider];
  const settings = await prisma.system_settings.findMany({
    where: {
      settingKey: { in: keys.map((k) => `sso.${provider}.${k}`) },
    },
  });

  const config: Record<string, any> = { enabled: false };
  for (const setting of settings) {
    const field = setting.settingKey.replace(`sso.${provider}.`, "");
    let value = setting.settingValue;
    if (value && setting.isEncrypted) {
      try {
        value = decrypt(value);
      } catch {
        value = "";
      }
    }
    if (field === "enabled") {
      config[field] = value === "true";
    } else {
      config[field] = value || "";
    }
  }
  return config as SsoProviderConfig;
}

export async function setSsoProviderConfig(
  provider: SsoProviderType,
  config: Partial<SsoProviderConfig>,
): Promise<void> {
  const keys = PROVIDER_KEYS[provider];
  const now = new Date();

  for (const field of keys) {
    if (!(field in config)) continue;
    const key = `sso.${provider}.${field}`;
    const isEncrypted = ENCRYPTED_FIELDS.includes(field);
    let value = String(config[field as keyof SsoProviderConfig] ?? "");

    // Don't overwrite secrets with masked placeholder
    if (isEncrypted && value === "••••••••") continue;

    if (isEncrypted && value) {
      value = encrypt(value);
    }

    await prisma.system_settings.upsert({
      where: { settingKey: key },
      update: {
        settingValue: value,
        isEncrypted,
        updatedAt: now,
      },
      create: {
        settingKey: key,
        settingValue: value,
        settingType: isEncrypted ? "encrypted" : "string",
        category: "sso",
        description: `SSO ${provider} ${field}`,
        isEncrypted,
        updatedAt: now,
      },
    });
  }
}

export async function getEnabledProviders(): Promise<SsoProviderType[]> {
  const settings = await prisma.system_settings.findMany({
    where: {
      settingKey: { endsWith: ".enabled" },
      settingValue: "true",
      category: "sso",
    },
  });

  return settings
    .map((s) => {
      const match = s.settingKey.match(/^sso\.(\w+)\.enabled$/);
      return match?.[1] as SsoProviderType | undefined;
    })
    .filter((p): p is SsoProviderType => !!p && p in PROVIDER_KEYS);
}

export async function getAutoCreateSetting(): Promise<boolean> {
  const setting = await prisma.system_settings.findUnique({
    where: { settingKey: "sso.autoCreateUsers" },
  });
  return setting?.settingValue === "true";
}
```

**Step 2: Create the admin API route**

Create `src/app/api/admin/settings/sso-providers/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  getSsoProviderConfig,
  setSsoProviderConfig,
  getEnabledProviders,
  SsoProviderType,
} from "@/lib/sso-providers";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

const VALID_PROVIDERS: SsoProviderType[] = [
  "microsoft",
  "google",
  "github",
  "apple",
];

export async function GET() {
  try {
    await requireApiAdmin();

    const providers: Record<string, any> = {};
    for (const p of VALID_PROVIDERS) {
      const config = await getSsoProviderConfig(p);
      // Mask secrets for response
      providers[p] = {
        ...config,
        clientSecret: config.clientSecret ? "••••••••" : "",
        privateKey: config.privateKey ? "••••••••" : "",
      };
    }

    return NextResponse.json({ providers });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("GET /api/admin/settings/sso-providers error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireApiAdmin();
    const body = await request.json();
    const { provider, config } = body as {
      provider: string;
      config: Record<string, any>;
    };

    if (!VALID_PROVIDERS.includes(provider as SsoProviderType)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    await setSsoProviderConfig(provider as SsoProviderType, config);

    await createAuditLog({
      userId: admin.id,
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.SETTINGS,
      entityId: `sso.${provider}`,
      details: {
        provider,
        enabled: config.enabled,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("PUT /api/admin/settings/sso-providers error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
```

**Step 3: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/sso-providers.ts src/app/api/admin/settings/sso-providers/route.ts
git commit -m "feat: add SSO provider configuration API and helper"
```

---

### Task 9: Register BetterAuth Social Providers Dynamically

**Files:**

- Modify: `src/lib/auth-server.ts`

**Step 1: Add social provider registration**

Import BetterAuth's social provider plugins and conditionally register them based on DB config. This requires loading config at module initialization time (top-level await or lazy init pattern).

Add to the top of `src/lib/auth-server.ts`:

```typescript
import { microsoft } from "better-auth/plugins/microsoft";
import { google } from "better-auth/plugins/google";
import { github } from "better-auth/plugins/github";
import { apple } from "better-auth/plugins/apple";
```

Note: The exact import paths depend on the BetterAuth version. If social providers are under `better-auth/social-providers` or similar, adjust accordingly. Check the installed version:

Run: `grep -r "export.*microsoft\|socialProviders" node_modules/better-auth/dist/ | head -10`

Since BetterAuth social providers are configured in the `socialProviders` config key (not as plugins), update the `betterAuth({})` call to include them. However, since DB config can't be loaded synchronously at module init time, use env var fallbacks initially:

```typescript
// Add to the betterAuth config object:
socialProviders: {
  ...(process.env.MICROSOFT_CLIENT_ID && {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.MICROSOFT_TENANT_ID || "common",
    },
  }),
  ...(process.env.GOOGLE_CLIENT_ID && {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  }),
  ...(process.env.GITHUB_CLIENT_ID && {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  }),
  ...(process.env.APPLE_CLIENT_ID && {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
    },
  }),
},
```

> **Implementation note:** The exact BetterAuth API for social providers varies by version. Check `node_modules/better-auth` for the correct config shape. The approach above uses env vars for the initial implementation. A follow-up enhancement can load from DB and reinitialize auth when admin saves config.

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (may need to adjust import paths)

**Step 3: Commit**

```bash
git add src/lib/auth-server.ts
git commit -m "feat: register BetterAuth social providers from env vars"
```

---

### Task 10: Update Providers API for Login Page

**Files:**

- Create: `src/app/api/auth/providers/route.ts`

**Step 1: Create the public providers endpoint**

This replaces the single-provider `sso-status` approach with a multi-provider endpoint. Create `src/app/api/auth/providers/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getEnabledProviders, getSsoProviderConfig } from "@/lib/sso-providers";
import { getSsoSettings } from "@/lib/sso";

const PROVIDER_DISPLAY: Record<
  string,
  { name: string; icon: string; color: string }
> = {
  microsoft: { name: "Microsoft", icon: "microsoft", color: "#2F2F2F" },
  google: { name: "Google", icon: "google", color: "#4285F4" },
  github: { name: "GitHub", icon: "github", color: "#24292F" },
  apple: { name: "Apple", icon: "apple", color: "#000000" },
};

export async function GET() {
  try {
    const providers: Array<{
      id: string;
      name: string;
      icon: string;
      color: string;
    }> = [];

    // Check new multi-provider config
    const enabled = await getEnabledProviders();
    for (const p of enabled) {
      const config = await getSsoProviderConfig(p);
      if (config.enabled && config.clientId) {
        const display = PROVIDER_DISPLAY[p];
        if (display) {
          providers.push({ id: p, ...display });
        }
      }
    }

    // Also check legacy SSO config (SAML/OIDC)
    try {
      const legacySettings = await getSsoSettings();
      if (legacySettings.enabled && providers.length === 0) {
        providers.push({
          id: "sso",
          name: legacySettings.providerName || "SSO",
          icon: "shield",
          color: "#6366F1",
        });
      }
    } catch {
      // Legacy SSO not configured
    }

    return NextResponse.json({ providers });
  } catch {
    return NextResponse.json({ providers: [] });
  }
}

export const dynamic = "force-dynamic";
```

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/auth/providers/route.ts
git commit -m "feat: add GET /api/auth/providers endpoint for multi-provider login"
```

---

### Task 11: Update Login Page for Multiple SSO Providers

**Files:**

- Modify: `src/app/login/LoginForm.tsx`

**Step 1: Update the login page**

Replace the single SSO button with dynamic provider buttons:

1. Change the `ssoStatus` fetch to use `/api/auth/providers` instead of `/api/auth/sso-status`
2. Replace the `SsoStatus` interface with a providers array
3. Render a button per enabled provider with proper icons
4. Keep backward compatibility with legacy SSO (redirect to `/api/auth/sso-init`)
5. For BetterAuth social providers, use the BetterAuth social sign-in URL pattern

Update the state and fetch (around lines 104, 119–126):

```typescript
const [ssoProviders, setSsoProviders] = useState<
  Array<{ id: string; name: string; icon: string; color: string }>
>([]);

// Replace the ssoStatus useEffect:
useEffect(() => {
  fetch("/api/auth/providers")
    .then((res) => res.json())
    .then((data) => {
      if (data.providers?.length) setSsoProviders(data.providers);
    })
    .catch(() => {});
}, []);
```

Replace the SSO button section (lines 281–300):

```tsx
{
  ssoProviders.length > 0 && (
    <>
      <div className="relative my-4">
        <Separator />
        <span className="bg-card text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-xs">
          or
        </span>
      </div>
      <div className="space-y-2">
        {ssoProviders.map((provider) => (
          <Button
            key={provider.id}
            variant="outline"
            className="w-full"
            onClick={() => {
              if (provider.id === "sso") {
                // Legacy SAML/OIDC
                window.location.href = "/api/auth/sso-init";
              } else {
                // BetterAuth social provider
                window.location.href = `/api/auth/sign-in/social?provider=${provider.id}`;
              }
            }}
          >
            <Shield className="mr-2 h-4 w-4" />
            Sign in with {provider.name}
          </Button>
        ))}
      </div>
    </>
  );
}
```

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/login/LoginForm.tsx
git commit -m "feat: render multiple SSO provider buttons on login page"
```

---

### Task 12: Update Admin SSO Settings Tab for Multi-Provider

**Files:**

- Modify: `src/app/admin/settings/ui/SSOSettingsTab.tsx`

**Step 1: Add provider config sections**

Add a new "Social Login Providers" section below the existing SAML/OIDC config in `SSOSettingsTab.tsx`. For each provider (Microsoft, Google, GitHub, Apple):

1. Enable/disable toggle
2. Client ID input
3. Client Secret input (masked with `type="password"`)
4. Provider-specific fields (Tenant ID for Microsoft, Team ID/Key ID/Private Key for Apple)
5. Save button per provider
6. Help text with link to provider's app registration docs

The data loads from `GET /api/admin/settings/sso-providers` and saves via `PUT /api/admin/settings/sso-providers`.

Add auto-create toggle at the bottom:

- "Allow auto-creation of users from SSO login"
- Default role selector (when auto-create is on)

This is a significant UI addition. The full component code should follow the existing pattern in `SSOSettingsTab.tsx` (Card-based layout, Switch toggles, Input fields, Save buttons with loading states).

**Step 2: Verify build**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/admin/settings/ui/SSOSettingsTab.tsx
git commit -m "feat: add multi-provider SSO configuration to admin settings"
```

---

### Task 13: Update .env.example

**Files:**

- Modify: `.env.example`

**Step 1: Add SSO provider env vars**

Add a new section to `.env.example`:

```bash
# -------------------------------------------------------------------
# SSO / Social Login Providers (optional — configure via Admin Settings UI or env vars)
# -------------------------------------------------------------------
# MICROSOFT_CLIENT_ID=
# MICROSOFT_CLIENT_SECRET=
# MICROSOFT_TENANT_ID=common

# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=

# APPLE_CLIENT_ID=
# APPLE_CLIENT_SECRET=
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add SSO provider env vars to .env.example"
```

---

## Verification Checklist

After all tasks are complete, verify:

1. **Generate password mode:** Create user → password shown in readonly field → copy works → magic link email sent → user clicks link → sets own password → can log in
2. **Manual password mode:** Create user with typed password → magic link email sent if email provided → user can log in immediately with typed password
3. **Invite mode:** Create user without password → invitation email sent → user clicks invite link → sets password → can log in
4. **SSO provider config:** Admin → Settings → SSO → enable Microsoft → save client ID/secret/tenant → appears on login page
5. **SSO login:** Click "Sign in with Microsoft" on login page → redirected to Microsoft → returns authenticated
6. **Legacy SSO:** Existing SAML/OIDC config still works alongside new providers
7. **Type-check passes:** `bunx tsc --noEmit`
8. **Build succeeds:** `bun run build` (or at least the pages compile)

---

## Files Summary

| Action | File                                                |
| ------ | --------------------------------------------------- |
| Modify | `src/lib/email/templates.ts`                        |
| Create | `src/app/api/auth/set-password/route.ts`            |
| Create | `src/app/set-password/[token]/page.tsx`             |
| Create | `src/lib/magic-link.ts`                             |
| Modify | `src/lib/validation.ts`                             |
| Modify | `src/app/api/user/addUser/route.ts`                 |
| Modify | `src/app/user/create/page.tsx`                      |
| Create | `src/lib/sso-providers.ts`                          |
| Create | `src/app/api/admin/settings/sso-providers/route.ts` |
| Modify | `src/lib/auth-server.ts`                            |
| Create | `src/app/api/auth/providers/route.ts`               |
| Modify | `src/app/login/LoginForm.tsx`                       |
| Modify | `src/app/admin/settings/ui/SSOSettingsTab.tsx`      |
| Modify | `.env.example`                                      |

## Dependencies

No new npm packages required — BetterAuth includes social provider support, and all other dependencies (bcryptjs, zod, prisma) are already installed.
