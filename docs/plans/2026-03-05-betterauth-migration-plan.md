# NextAuth → BetterAuth Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace NextAuth v5 beta with BetterAuth, adopting its 2FA and SSO plugins while preserving the existing multi-tenancy, LDAP, and RBAC systems.

**Architecture:** BetterAuth server instance with Prisma adapter, database-backed sessions with cookie caching, custom LDAP integration via hooks. Auth guard interface (`requireApiAuth`, `requirePermission`, etc.) stays unchanged — only internals are rewired.

**Tech Stack:** better-auth, better-auth/react, Prisma (PostgreSQL), otplib (kept for LDAP MFA path), bcryptjs (used by BetterAuth internally)

**Design doc:** `docs/plans/2026-03-05-betterauth-migration-design.md`

---

## Task 1: Install BetterAuth and Remove NextAuth

**Files:**

- Modify: `package.json`

**Step 1: Install better-auth**

```bash
npm install better-auth
```

**Step 2: Remove next-auth**

```bash
npm uninstall next-auth
```

**Step 3: Verify installation**

```bash
npm ls better-auth
```

Expected: `better-auth@1.x.x`

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace next-auth with better-auth dependency"
```

---

## Task 2: Database Schema Migration

**Files:**

- Modify: `prisma/schema.prisma`

**Step 1: Run BetterAuth schema generator to see what it expects**

```bash
npx @better-auth/cli generate --config src/lib/auth.ts 2>&1 || true
```

Note: This may fail since auth.ts doesn't exist yet. Use it as a reference only. The actual changes needed are documented below.

**Step 2: Update the Prisma schema**

Modify `prisma/schema.prisma` with these changes:

**a) `sessions` model — rename columns for BetterAuth compatibility:**

```prisma
model sessions {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  token        String   @unique                    // was: sessionToken
  userId       String   @db.Uuid
  expiresAt    DateTime                             // was: expires
  ipAddress    String?  @db.VarChar(45)
  userAgent    String?  @db.VarChar(500)
  deviceName   String?  @db.VarChar(100)
  lastActive   DateTime @default(now()) @db.Timestamp(6)
  createdAt    DateTime @default(now()) @db.Timestamp(6)
  updatedAt    DateTime @default(now()) @db.Timestamp(6)
  isCurrent    Boolean  @default(false)
  user         user     @relation(fields: [userId], references: [userid], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}
```

**b) `accounts` model — rename columns for BetterAuth compatibility:**

```prisma
model accounts {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId                String    @db.Uuid
  accountId             String                     // was: providerAccountId
  providerId            String                     // was: provider
  accessToken           String?                    // was: access_token
  refreshToken          String?                    // was: refresh_token
  accessTokenExpiresAt  DateTime?                  // new
  refreshTokenExpiresAt DateTime?                  // new
  scope                 String?
  idToken               String?                    // was: id_token
  password              String?                    // new — BetterAuth stores hashed pwd here
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @default(now())
  user                  user      @relation(fields: [userId], references: [userid], onDelete: Cascade)

  @@index([userId])
  @@map("accounts")
}
```

**c) `verification_tokens` → `verification` model:**

```prisma
model verification {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identifier String
  value      String                                // was: token
  expiresAt  DateTime                              // was: expires
  createdAt  DateTime @default(now())
  updatedAt  DateTime @default(now())

  @@map("verification")
}
```

**d) `user` model — add BetterAuth required fields:**

Add these fields to the existing `user` model:

```prisma
  emailVerified         Boolean                   @default(false)
  image                 String?
  twoFactorEnabled      Boolean?                  // BetterAuth 2FA plugin
  updatedAt             DateTime                  @default(now())
```

Note: Keep ALL existing custom fields (`isadmin`, `canrequest`, `mfaEnabled`, `mfaSecret`, `mfaBackupCodes`, `authProvider`, `externalId`, `ldapDN`, etc.). BetterAuth's Prisma adapter ignores columns it doesn't know about.

**e) Add `twoFactor` model (BetterAuth 2FA plugin):**

```prisma
model twoFactor {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  secret    String
  backupCodes String
  userId    String  @db.Uuid
  user      user    @relation(fields: [userId], references: [userid], onDelete: Cascade)

  @@map("twoFactor")
}
```

Add the relation to the `user` model:

```prisma
  twoFactor                        twoFactor[]
```

**Step 3: Create the migration**

```bash
npx prisma migrate dev --name betterauth-schema-migration
```

If there's data in existing tables, Prisma may require a data migration. Use `prisma migrate dev --create-only` first, then edit the SQL to use `ALTER TABLE ... RENAME COLUMN` instead of drop+create.

**Step 4: Verify migration**

```bash
npx prisma generate
```

Expected: Prisma client generated successfully.

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat: migrate database schema for BetterAuth compatibility"
```

---

## Task 3: Create BetterAuth Server Instance

**Files:**

- Create: `src/lib/auth.ts` (new file — the old `src/auth.ts` gets deleted later)
- Create: `src/lib/auth-client.ts`

**Step 1: Create the BetterAuth server instance**

Create `src/lib/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins/two-factor";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";
import {
  isAccountLocked,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from "@/lib/account-lockout";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXTAUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    async verifyPassword({ password, hash }) {
      return bcrypt.compare(password, hash);
    },
    async hashPassword(password) {
      return bcrypt.hash(password, 10);
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5-minute cache
    },
  },

  user: {
    // Map BetterAuth's expected fields to our Prisma model
    modelName: "user",
    fields: {
      id: "userid",
      name: {
        // BetterAuth expects a `name` field; we compute it
        required: false,
      },
    },
    additionalFields: {
      username: { type: "string", required: false, input: true },
      firstname: { type: "string", required: true, input: true },
      lastname: { type: "string", required: true, input: true },
      isadmin: { type: "boolean", required: false, defaultValue: false },
      canrequest: { type: "boolean", required: false, defaultValue: true },
      organizationId: { type: "string", required: false, input: true },
      departmentId: { type: "string", required: false },
      authProvider: { type: "string", required: false, defaultValue: "local" },
      isActive: { type: "boolean", required: false, defaultValue: true },
      mfaEnabled: { type: "boolean", required: false, defaultValue: false },
    },
  },

  plugins: [
    twoFactor({
      issuer: "AssetTracker",
      totpOptions: {
        digits: 6,
        period: 30,
      },
      backupCodes: {
        length: 8,
        count: 8,
      },
    }),
  ],

  // Hooks for custom login logic
  hooks: {
    before: [
      {
        matcher(context) {
          return context.path === "/sign-in/email";
        },
        async handler(ctx) {
          const body = ctx.body as
            | { email?: string; password?: string }
            | undefined;
          if (!body?.email) return;

          const identifier = body.email;
          const lockStatus = isAccountLocked(identifier);
          if (lockStatus.locked) {
            logger.securityEvent("Login attempt on locked account", {
              identifier,
            });
            throw new Error("Account is temporarily locked.");
          }
        },
      },
    ],
    after: [
      {
        matcher(context) {
          return context.path === "/sign-in/email";
        },
        async handler(ctx) {
          const body = ctx.body as { email?: string } | undefined;
          if (!body?.email) return;

          if (ctx.responseHeader?.get("set-cookie")) {
            // Login succeeded
            recordSuccessfulLogin(body.email);

            // Find user for audit log
            const user = await prisma.user.findFirst({
              where: {
                OR: [{ email: body.email }, { username: body.email }],
              },
              select: { userid: true, username: true },
            });
            if (user) {
              await createAuditLog({
                userId: user.userid,
                action: AUDIT_ACTIONS.LOGIN,
                entity: AUDIT_ENTITIES.USER,
                entityId: user.userid,
                details: { username: user.username, method: "credentials" },
              });
            }
          } else {
            // Login failed
            recordFailedAttempt(body.email);
          }
        },
      },
    ],
  },
});

export type Session = typeof auth.$Infer.Session;
```

**Step 2: Create the BetterAuth client**

Create `src/lib/auth-client.ts`:

```typescript
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});

export const { signIn, signOut, useSession } = authClient;
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

This will likely have errors from the old auth files still importing NextAuth. That's expected — we fix those in subsequent tasks.

**Step 4: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts
git commit -m "feat: create BetterAuth server instance and client"
```

---

## Task 4: Create New API Route Handler

**Files:**

- Create: `src/app/api/auth/[...all]/route.ts`
- Delete: `src/app/api/auth/[...nextauth]/route.ts`

**Step 1: Create the BetterAuth catch-all handler**

Create `src/app/api/auth/[...all]/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

**Step 2: Delete the old NextAuth handler**

```bash
rm src/app/api/auth/\[...nextauth\]/route.ts
rmdir src/app/api/auth/\[...nextauth\]
```

**Step 3: Commit**

```bash
git add -A src/app/api/auth/
git commit -m "feat: replace NextAuth catch-all with BetterAuth handler"
```

---

## Task 5: Rewire Auth Guards (Zero-Interface-Change)

**Files:**

- Modify: `src/lib/api-auth.ts`
- Modify: `src/lib/auth-guards.ts`

This is the critical task — the auth guard interface stays exactly the same, but internals switch from NextAuth to BetterAuth.

**Step 1: Rewrite `src/lib/api-auth.ts`**

Replace the entire file:

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { hasPermission, hasAnyPermission, type Permission } from "./rbac";
import prisma from "./prisma";

/**
 * Block mutating operations in demo mode.
 * Returns a 403 response if DEMO_MODE is enabled, null otherwise.
 */
export function requireNotDemoMode() {
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json(
      { error: "This action is disabled in demo mode" },
      { status: 403 },
    );
  }
  return null;
}

export interface AuthUser {
  id?: string;
  isAdmin?: boolean;
  canRequest?: boolean;
  name?: string | null;
  email?: string | null;
  username?: string;
  firstname?: string;
  lastname?: string;
  organizationId?: string;
}

/**
 * Get authenticated user from session.
 * Fetches custom fields from Prisma since BetterAuth sessions
 * only store standard fields.
 */
export async function getAuthUser(): Promise<AuthUser> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  // Fetch custom user fields from DB
  const dbUser = await prisma.user.findUnique({
    where: { userid: session.user.id },
    select: {
      userid: true,
      username: true,
      firstname: true,
      lastname: true,
      email: true,
      isadmin: true,
      canrequest: true,
      organizationId: true,
      departmentId: true,
      isActive: true,
    },
  });

  if (!dbUser || !dbUser.isActive) {
    throw new Error("Unauthorized");
  }

  return {
    id: dbUser.userid,
    name: `${dbUser.firstname} ${dbUser.lastname}`,
    email: dbUser.email,
    username: dbUser.username || undefined,
    firstname: dbUser.firstname,
    lastname: dbUser.lastname,
    isAdmin: dbUser.isadmin,
    canRequest: dbUser.canrequest,
    organizationId: dbUser.organizationId || undefined,
  };
}

/**
 * Require authentication for API routes
 */
export async function requireApiAuth(): Promise<AuthUser> {
  return await getAuthUser();
}

/**
 * Require admin role for API routes
 */
export async function requireApiAdmin(): Promise<AuthUser> {
  const user = await getAuthUser();

  if (!user.isAdmin) {
    throw new Error("Forbidden: Admin access required");
  }

  return user;
}

/**
 * Check if user has request permission
 */
export async function requireApiCanRequest(): Promise<AuthUser> {
  const user = await getAuthUser();

  if (!user.canRequest && !user.isAdmin) {
    throw new Error("Forbidden: Request permission required");
  }

  return user;
}

/**
 * Require specific permission(s) for API routes
 * Checks RBAC permissions via user roles. Admin users pass all checks.
 */
export async function requirePermission(
  ...permissions: Permission[]
): Promise<AuthUser> {
  const user = await getAuthUser();

  if (!user.id) {
    throw new Error("Unauthorized");
  }

  // Admin users bypass permission checks
  if (user.isAdmin) {
    return user;
  }

  const hasAccess =
    permissions.length === 1
      ? await hasPermission(user.id, permissions[0])
      : await hasAnyPermission(user.id, permissions);

  if (!hasAccess) {
    throw new Error("Forbidden: Insufficient permissions");
  }

  return user;
}
```

**Step 2: Rewrite `src/lib/auth-guards.ts`**

Replace the entire file:

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "./prisma";

interface ExtendedSession {
  user: {
    id?: string;
    isAdmin?: boolean;
    canRequest?: boolean;
    name?: string | null;
    email?: string | null;
    username?: string;
    firstname?: string;
    lastname?: string;
    organizationId?: string;
    departmentId?: string;
  };
}

/**
 * Require authentication for a page.
 * Redirects to login if not authenticated.
 */
export async function requireAuth(): Promise<ExtendedSession> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    redirect("/login");
  }

  // Fetch custom fields
  const dbUser = await prisma.user.findUnique({
    where: { userid: session.user.id },
    select: {
      userid: true,
      username: true,
      firstname: true,
      lastname: true,
      email: true,
      isadmin: true,
      canrequest: true,
      organizationId: true,
      departmentId: true,
      isActive: true,
    },
  });

  if (!dbUser || !dbUser.isActive) {
    redirect("/login");
  }

  return {
    user: {
      id: dbUser.userid,
      name: `${dbUser.firstname} ${dbUser.lastname}`,
      email: dbUser.email,
      username: dbUser.username || undefined,
      firstname: dbUser.firstname,
      lastname: dbUser.lastname,
      isAdmin: dbUser.isadmin,
      canRequest: dbUser.canrequest,
      organizationId: dbUser.organizationId || undefined,
      departmentId: dbUser.departmentId || undefined,
    },
  };
}

/**
 * Require admin role for a page.
 * Redirects to login if not authenticated.
 * Redirects to home if not admin.
 */
export async function requireAdmin(): Promise<ExtendedSession> {
  const session = await requireAuth();

  if (!session.user.isAdmin) {
    redirect("/dashboard");
  }

  return session;
}

/**
 * Require request permission for a page.
 */
export async function requireCanRequest(): Promise<ExtendedSession> {
  const session = await requireAuth();

  if (!session.user.canRequest && !session.user.isAdmin) {
    throw new Error("You do not have permission to request items");
  }

  return session;
}
```

**Step 3: Commit**

```bash
git add src/lib/api-auth.ts src/lib/auth-guards.ts
git commit -m "feat: rewire auth guards to BetterAuth (same interface)"
```

---

## Task 6: Update Server-Side Auth Imports (Pages & API Routes)

**Files:**

- Modify: All files that import `auth` from `@/auth` (44 files)
- These files need their import changed from `import { auth } from "@/auth"` to `import { auth } from "@/lib/auth"`

**Step 1: Update files that use `auth()` directly**

The following files call `auth()` directly (not via auth guards). They need to switch to `auth.api.getSession()`:

**`src/app/layout.tsx`** — Change:

```typescript
// Before
import { auth } from "../auth";
const session = await auth();

// After
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
const session = await auth.api.getSession({ headers: await headers() });
```

Also remove `<SessionProvider session={session}>` wrapper — BetterAuth doesn't need it. Replace with just rendering children directly. The `UserPreferencesProvider` should use BetterAuth's client-side session.

**`src/app/page.tsx`** — Change:

```typescript
// Before
import { auth } from "@/auth";
const session = await auth();

// After
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
let session = null;
try {
  session = await auth.api.getSession({ headers: await headers() });
} catch {}
```

**`src/lib/organization-context.ts`** — Change:

```typescript
// Before
import { auth } from "@/auth";
const session = await auth();

// After
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
const session = await auth.api.getSession({ headers: await headers() });
```

**Step 2: Update files that import `auth` but use it via guards**

Files that import from `@/auth` only to pass to guards (like admin pages calling `auth()` directly for session info) need the same import path change. The following server pages import `auth` directly:

- `src/app/admin/settings/page.tsx`
- `src/app/admin/team/page.tsx`
- `src/app/admin/tickets/page.tsx`
- `src/app/admin/workflows/page.tsx`
- `src/app/admin/audit-logs/page.tsx`
- `src/app/admin/compliance/page.tsx`
- `src/app/admin/gdpr/page.tsx`
- `src/app/user/[id]/settings/page.tsx`
- `src/app/reports/page.tsx`
- `src/app/approvals/page.tsx`
- `src/app/tickets/page.tsx`
- `src/app/user/tickets/page.tsx`

For each: change `import { auth } from "@/auth"` to `import { auth } from "@/lib/auth"`, and change `await auth()` to `await auth.api.getSession({ headers: await headers() })`. If the file doesn't already import `headers`, add `import { headers } from "next/headers"`.

**Step 3: Update API routes that import from `@/auth` directly**

These API routes import `auth` directly (not via `api-auth.ts`):

- `src/app/api/asset/reservations/route.ts`
- `src/app/api/admin/settings/integrations/test/route.ts`
- `src/app/api/admin/settings/ldap/sync/route.ts`
- `src/app/api/admin/settings/ldap/test/route.ts`
- `src/app/api/stock-alerts/route.ts`
- `src/app/api/stock-alerts/[id]/route.ts`
- `src/app/api/tickets/[id]/route.ts`
- `src/app/api/tickets/route.ts`
- `src/app/api/webhooks/[id]/route.ts`
- `src/app/api/notifications/[id]/route.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/reservations/[id]/route.ts`
- `src/app/api/roles/[id]/route.ts`
- `src/app/api/roles/route.ts`
- `src/app/api/organizations/[id]/route.ts`
- `src/app/api/departments/[id]/route.ts`
- `src/app/api/asset/transfers/route.ts`
- `src/app/api/admin/settings/integrations/route.ts`
- `src/app/api/admin/settings/notifications/route.ts`
- `src/app/api/admin/settings/general/route.ts`
- `src/app/api/admin/settings/ldap/route.ts`
- `src/app/api/admin/settings/sso/route.ts`
- `src/app/api/admin/settings/freshdesk/route.ts`
- `src/app/api/admin/settings/email/route.ts`
- `src/app/api/admin/settings/freshdesk/test/route.ts`
- `src/app/api/admin/settings/email/test/route.ts`

For each: same pattern — change import path, change `auth()` to `auth.api.getSession({ headers: await headers() })`.

**Step 4: Verify no remaining `@/auth` imports**

```bash
grep -r "from \"@/auth\"" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Expected: Zero results (or only test files).

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: update all server-side auth imports to BetterAuth"
```

---

## Task 7: Update Client-Side Components

**Files:**

- Modify: `src/components/SessionProvider.tsx` (delete or replace)
- Modify: `src/components/SignOutButton.tsx`
- Modify: `src/components/Navigation.tsx`
- Modify: `src/contexts/UserPreferencesContext.tsx`
- Modify: `src/components/OnboardingWizard.tsx`
- Modify: `src/app/assets/[id]/ui/AssetCheckoutHistory.tsx`
- Modify: `src/app/assets/[id]/ui/AssetReservations.tsx`
- Modify: `src/app/approvals/ui/ApprovalsPageClient.tsx`
- Modify: `src/hooks/usePermissions.ts`
- Modify: `src/app/layout.tsx` (remove SessionProvider wrapper)

**Step 1: Delete `src/components/SessionProvider.tsx`**

BetterAuth doesn't need a session provider wrapper. Delete the file.

```bash
rm src/components/SessionProvider.tsx
```

**Step 2: Update `src/app/layout.tsx`**

Remove the SessionProvider import and wrapper:

```typescript
// Remove these:
// import { SessionProvider } from "../components/SessionProvider";
// import { auth } from "../auth";

// Change body content to:
<body>
  <SkipToContent />
  <OfflineBanner />
  <ServiceWorkerRegistration />
  <UserPreferencesProvider>
    <Providers>
      <AppShell
        initialSidebarCollapsed={initialSidebarCollapsed}
        isDemo={isDemo}
      >
        {children}
      </AppShell>
      <PWAInstallPrompt />
    </Providers>
  </UserPreferencesProvider>
</body>
```

Also remove the `const session = await auth()` line since the SessionProvider no longer needs it.

**Step 3: Update `src/components/SignOutButton.tsx`**

```typescript
"use client";

import { authClient } from "@/lib/auth-client";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  return (
    <DropdownMenuItem
      className="text-destructive cursor-pointer"
      onSelect={async (e) => {
        e.preventDefault();
        await authClient.signOut();
        router.push("/login");
      }}
    >
      Log Out
    </DropdownMenuItem>
  );
}
```

**Step 4: Update all `useSession()` imports**

In each of these files, replace:

```typescript
import { useSession } from "next-auth/react";
const { data: session } = useSession();
```

With:

```typescript
import { authClient } from "@/lib/auth-client";
const { data: session } = authClient.useSession();
```

Files to update:

- `src/components/Navigation.tsx`
- `src/contexts/UserPreferencesContext.tsx`
- `src/components/OnboardingWizard.tsx`
- `src/app/assets/[id]/ui/AssetCheckoutHistory.tsx`
- `src/app/assets/[id]/ui/AssetReservations.tsx`
- `src/app/approvals/ui/ApprovalsPageClient.tsx`
- `src/hooks/usePermissions.ts`

Note: BetterAuth's `useSession()` returns `{ data: { session, user }, isPending, error }` — the user object is at `session.user` just like NextAuth but the shape differs slightly. Custom fields (isAdmin, username, etc.) will need to be fetched separately since they're not in BetterAuth's default session. Consider creating a `useAuthUser()` hook that combines the session with a user profile API call.

**Step 5: Create `src/hooks/useAuthUser.ts` for custom user fields**

```typescript
"use client";

import { authClient } from "@/lib/auth-client";
import { useState, useEffect } from "react";

interface AuthUser {
  id?: string;
  isAdmin?: boolean;
  canRequest?: boolean;
  name?: string | null;
  email?: string | null;
  username?: string;
  firstname?: string;
  lastname?: string;
  organizationId?: string;
  departmentId?: string;
}

export function useAuthUser() {
  const { data: sessionData, isPending } = authClient.useSession();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!sessionData?.user?.id) {
      setUser(null);
      return;
    }

    // Fetch custom user fields
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, [sessionData?.user?.id]);

  return {
    user,
    session: sessionData,
    isPending,
    isAuthenticated: !!sessionData?.user,
  };
}
```

**Step 6: Create `/api/auth/me` endpoint**

Create `src/app/api/auth/me/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(null, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { userid: session.user.id },
      select: {
        userid: true,
        username: true,
        firstname: true,
        lastname: true,
        email: true,
        isadmin: true,
        canrequest: true,
        organizationId: true,
        departmentId: true,
      },
    });

    if (!user) return NextResponse.json(null, { status: 401 });

    return NextResponse.json({
      id: user.userid,
      username: user.username,
      firstname: user.firstname,
      lastname: user.lastname,
      name: `${user.firstname} ${user.lastname}`,
      email: user.email,
      isAdmin: user.isadmin,
      canRequest: user.canrequest,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
    });
  } catch {
    return NextResponse.json(null, { status: 401 });
  }
}
```

**Step 7: Update `src/hooks/usePermissions.ts`**

```typescript
"use client";

import { useAuthUser } from "@/hooks/useAuthUser";
import { userHasPermission, type Permission } from "@/lib/permissions";

interface PermissionsHook {
  hasPermission: (permission: Permission) => boolean;
  isAdmin: () => boolean;
  canRequest: () => boolean;
  user: ReturnType<typeof useAuthUser>["user"];
}

export function usePermissions(): PermissionsHook {
  const { user } = useAuthUser();

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    return userHasPermission(user, permission);
  };

  const isAdmin = (): boolean => {
    return user?.isAdmin || false;
  };

  const canRequestFn = (): boolean => {
    return user?.canRequest || false;
  };

  return {
    hasPermission,
    isAdmin,
    canRequest: canRequestFn,
    user,
  };
}
```

**Step 8: Commit**

```bash
git add -A src/
git commit -m "feat: update all client components to BetterAuth"
```

---

## Task 8: Rewrite Login and MFA Forms

**Files:**

- Modify: `src/app/login/LoginForm.tsx`
- Modify: `src/app/mfa-verify/MfaVerifyForm.tsx`

**Step 1: Rewrite `src/app/login/LoginForm.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, Shield } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface LoginPageProps {
  isDemo?: boolean;
}

interface SsoStatus {
  enabled: boolean;
  provider: string;
  providerName: string;
}

export default function LoginPage({ isDemo = false }: LoginPageProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [ssoStatus, setSsoStatus] = useState<SsoStatus | null>(null);

  useEffect(() => {
    fetch("/api/auth/sso-status")
      .then((res) => res.json())
      .then((data) => { if (data.enabled) setSsoStatus(data); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await authClient.signIn.email({
        email: formData.email,
        password: formData.password,
      });

      if (result.error) {
        setError(result.error.message || "Invalid credentials");
        setIsLoading(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("An error occurred during login");
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const fillDemoCredentials = (isAdmin: boolean) => {
    setFormData({
      email: isAdmin ? "demo_admin" : "demo_user",
      password: "demo123",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Asset Tracker</CardTitle>
          <CardDescription>Enter your credentials to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          {isDemo && (
            <div className="mb-4 rounded-md bg-amber-500/10 border border-amber-500/20 p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-medium mb-2">Demo Mode</p>
                  <p className="mb-2">Data resets every 30 minutes. Use one of the demo accounts below:</p>
                  <div className="space-y-1">
                    <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => fillDemoCredentials(true)}>
                      <span className="font-mono">demo_admin</span>
                      <span className="mx-2 text-muted-foreground">/</span>
                      <span className="font-mono">demo123</span>
                      <span className="ml-auto text-muted-foreground">(Admin)</span>
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => fillDemoCredentials(false)}>
                      <span className="font-mono">demo_user</span>
                      <span className="mx-2 text-muted-foreground">/</span>
                      <span className="font-mono">demo123</span>
                      <span className="ml-auto text-muted-foreground">(User)</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Username or Email</Label>
              <Input id="email" name="email" type="text" placeholder="Enter your username or email" value={formData.email} onChange={handleChange} disabled={isLoading} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" placeholder="Enter your password" value={formData.password} onChange={handleChange} disabled={isLoading} required />
            </div>
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">Forgot your password?</Link>
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          {ssoStatus && (
            <>
              <div className="relative my-4">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or</span>
              </div>
              <Button variant="outline" className="w-full" onClick={() => { window.location.href = "/api/auth/sso-init"; }}>
                <Shield className="h-4 w-4 mr-2" />
                Sign in with {ssoStatus.providerName}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

Note: BetterAuth uses `email` as the login identifier. Your users log in with `username`. You'll need to handle this in the BetterAuth server config — either by treating username as email in the sign-in hook, or by looking up the user's email by username before calling BetterAuth's sign-in.

**Step 2: Rewrite `src/app/mfa-verify/MfaVerifyForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MfaVerifyForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      let result;
      if (useBackupCode) {
        result = await authClient.twoFactor.verifyBackupCode({
          code: code.trim(),
        });
      } else {
        result = await authClient.twoFactor.verifyTotp({
          code: code.trim(),
        });
      }

      if (result.error) {
        setError(useBackupCode
          ? "Invalid backup code. Please try again."
          : "Invalid verification code. Please try again.");
        setIsLoading(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      console.error("MFA verification error:", err);
      setError("An error occurred during verification");
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Two-Factor Authentication</CardTitle>
          <CardDescription>
            {useBackupCode
              ? "Enter one of your backup codes to continue"
              : "Enter the 6-digit code from your authenticator app"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">{useBackupCode ? "Backup Code" : "Verification Code"}</Label>
              <Input id="code" type="text" placeholder={useBackupCode ? "Enter backup code" : "000000"} value={code} onChange={(e) => setCode(e.target.value)} disabled={isLoading} autoComplete="one-time-code" inputMode={useBackupCode ? "text" : "numeric"} maxLength={useBackupCode ? 20 : 6} required autoFocus />
            </div>
            {error && (
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Verifying..." : "Verify"}
            </Button>
            <div className="text-center">
              <button type="button" className="text-muted-foreground hover:text-foreground text-sm underline" onClick={() => { setUseBackupCode(!useBackupCode); setCode(""); setError(""); }}>
                {useBackupCode ? "Use authenticator app instead" : "Use a backup code instead"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/login/ src/app/mfa-verify/
git commit -m "feat: rewrite login and MFA forms for BetterAuth"
```

---

## Task 9: Update Proxy/Middleware

**Files:**

- Modify: `src/proxy.ts`

**Step 1: Rewrite `src/proxy.ts`**

Replace the NextAuth middleware with BetterAuth's cookie-based check:

```typescript
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { generateCorrelationId } from "@/lib/logger";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionCookie = getSessionCookie(req);
  const isLoggedIn = !!sessionCookie;

  const correlationId =
    req.headers.get("x-correlation-id") || generateCorrelationId();

  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/terms",
    "/privacy",
    "/offline",
    "/invite",
  ];
  const isPublicRoute = publicRoutes.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  const isHealthRoute = pathname.startsWith("/api/health");
  const isApiRoute = pathname.startsWith("/api");
  const isStaticFile =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons/") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/);

  if (isStaticFile) {
    return NextResponse.next();
  }

  if (isHealthRoute) {
    const response = NextResponse.next();
    response.headers.set("x-correlation-id", correlationId);
    return response;
  }

  // Redirect logged-in users away from login page
  if (isLoggedIn && pathname === "/login") {
    const response = NextResponse.redirect(new URL("/dashboard", req.url));
    response.headers.set("x-correlation-id", correlationId);
    return response;
  }

  // Redirect non-logged-in users to login
  if (!isLoggedIn && !isPublicRoute && !isApiRoute) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
```

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: rewrite proxy middleware for BetterAuth cookie sessions"
```

---

## Task 10: Clean Up Old NextAuth Files

**Files:**

- Delete: `src/auth.ts` (old NextAuth config)
- Delete: `src/auth.config.ts`
- Delete: `src/types/next-auth.d.ts`

**Step 1: Delete old files**

```bash
rm src/auth.ts
rm src/auth.config.ts
rm src/types/next-auth.d.ts
```

**Step 2: Verify no remaining next-auth references**

```bash
grep -r "next-auth" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

Expected: Zero results.

```bash
grep -r "from \"@/auth\"" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Expected: Zero results.

**Step 3: Update `session-tracking.ts`**

The session-tracking module uses `sessionToken` column name which was renamed to `token`. Update all references:

In `src/lib/session-tracking.ts`, change:

- `sessionToken` → `token` in Prisma queries
- `expires` → `expiresAt` in Prisma queries

**Step 4: TypeScript check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

Fix any remaining type errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old NextAuth files and fix remaining references"
```

---

## Task 11: Handle LDAP Login via BetterAuth

**Files:**

- Modify: `src/lib/auth.ts` (add LDAP hook)

**Step 1: Add LDAP authentication to the sign-in hook**

BetterAuth's `emailAndPassword` expects to verify a password hash from the `accounts` table. For LDAP users, we need to intercept the sign-in and perform LDAP bind authentication instead.

Update the `before` hook in `src/lib/auth.ts` to add LDAP handling:

```typescript
// In the before hook for /sign-in/email:
async handler(ctx) {
  const body = ctx.body as { email?: string; password?: string } | undefined;
  if (!body?.email || !body?.password) return;

  // Check if this user authenticates via LDAP
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: body.email }, { username: body.email }],
    },
    select: { userid: true, authProvider: true, username: true },
  });

  if (user?.authProvider === "ldap") {
    const { authenticateUser: ldapAuth } = await import("@/lib/ldap");
    const ldapResult = await ldapAuth(user.username || body.email, body.password);

    if (!ldapResult.success) {
      recordFailedAttempt(body.email);
      throw new Error("Invalid credentials");
    }

    // LDAP auth succeeded — let BetterAuth create the session
    // We need to bypass BetterAuth's password check for this user
    // This is done by updating the account's password hash to match
    // what was just provided (since we verified via LDAP)
    const hashedPassword = await bcrypt.hash(body.password, 10);
    await prisma.accounts.upsert({
      where: {
        // Find the credential account for this user
        provider_providerAccountId: {
          providerId: "credential",
          accountId: user.userid,
        },
      },
      update: { password: hashedPassword },
      create: {
        userId: user.userid,
        providerId: "credential",
        accountId: user.userid,
        password: hashedPassword,
      },
    });
  }
},
```

This approach syncs the LDAP password to BetterAuth's account store on each login, so BetterAuth's normal password verification succeeds.

**Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: wire LDAP authentication into BetterAuth sign-in hook"
```

---

## Task 12: Adapt MFA API Routes

**Files:**

- Modify: `src/app/api/auth/mfa/setup/route.ts`
- Modify: `src/app/api/auth/mfa/verify/route.ts`
- Modify: `src/app/api/auth/mfa/disable/route.ts`
- Delete: `src/app/api/auth/mfa/validate/route.ts` (BetterAuth handles this)

**Step 1: Check if BetterAuth's twoFactor plugin handles these routes automatically**

BetterAuth's 2FA plugin adds these endpoints:

- `POST /api/auth/two-factor/enable` — enables TOTP
- `POST /api/auth/two-factor/disable` — disables TOTP
- `POST /api/auth/two-factor/verify-totp` — verifies TOTP code during login
- `POST /api/auth/two-factor/generate-backup-codes` — generates backup codes

If these cover your needs, delete the custom MFA routes and update the frontend to call BetterAuth's endpoints instead.

**Step 2: Remove custom MFA routes**

```bash
rm -rf src/app/api/auth/mfa/
```

**Step 3: Update any frontend code that calls `/api/auth/mfa/*`**

Search for references:

```bash
grep -r "/api/auth/mfa" src/ --include="*.ts" --include="*.tsx"
```

Update each to use `authClient.twoFactor.*` methods instead.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace custom MFA routes with BetterAuth twoFactor plugin"
```

---

## Task 13: Adapt SSO Routes

**Files:**

- Evaluate: `src/app/api/auth/sso-init/route.ts`
- Evaluate: `src/app/api/auth/callback/saml/route.ts`
- Evaluate: `src/app/api/auth/callback/oidc/route.ts`
- Evaluate: `src/app/api/auth/sso-status/route.ts`
- Evaluate: `src/app/api/auth/sso-login/route.ts`
- Evaluate: `src/lib/sso.ts`

**Step 1: Configure BetterAuth's SSO plugin**

BetterAuth's SSO plugin handles SAML and OIDC natively. Configure it in `src/lib/auth.ts`:

```typescript
import { sso } from "better-auth/plugins/sso";

// Add to plugins array:
sso({
  // SSO providers are configured at runtime via the API
  // or you can set them here
}),
```

**Step 2: Evaluate which SSO routes can be removed**

BetterAuth's SSO plugin provides:

- `GET /api/auth/sso/sign-in` — Initiates SSO login
- `POST /api/auth/sso/callback` — Handles SSO callback

Compare with your current endpoints. If BetterAuth covers the flow, remove the custom routes. If your SSO routes have custom logic (like auto-creating users with specific `authProvider` values), keep them as custom routes that delegate to BetterAuth's session creation.

**Step 3: Keep `sso-status` route**

The `/api/auth/sso-status` endpoint is a simple settings check. It can stay as-is since it doesn't depend on NextAuth.

**Step 4: Commit after evaluation**

```bash
git add -A
git commit -m "feat: integrate BetterAuth SSO plugin"
```

---

## Task 14: Adapt Session Management Routes

**Files:**

- Modify: `src/app/api/auth/sessions/route.ts`
- Modify: `src/app/api/auth/sessions/[id]/route.ts`
- Modify: `src/app/api/auth/sessions/revoke-all/route.ts`
- Modify: `src/lib/session-tracking.ts`

**Step 1: Update session queries for renamed columns**

In `session-tracking.ts`, update all Prisma queries:

- `sessionToken` → `token`
- `expires` → `expiresAt`

BetterAuth manages session creation/expiry, so `createSessionRecord` may become optional — BetterAuth creates sessions automatically. However, your custom fields (`deviceName`, `lastActive`, `isCurrent`) may still need to be set via an `after` hook.

**Step 2: Add session enrichment hook in `src/lib/auth.ts`**

```typescript
// After hook for session creation
{
  matcher(context) {
    return context.path === "/sign-in/email";
  },
  async handler(ctx) {
    // After successful login, update session with device info
    if (ctx.responseHeader?.get("set-cookie")) {
      const ip = ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim()
        || ctx.headers?.get("x-real-ip")
        || null;
      const userAgent = ctx.headers?.get("user-agent") || null;

      // Find the most recently created session and enrich it
      // (BetterAuth just created it)
      // ... update with deviceName, lastActive, etc.
    }
  },
},
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: adapt session management for BetterAuth"
```

---

## Task 15: Update Environment Variables

**Files:**

- Modify: `.env` / `.env.local` / `.env.example`

**Step 1: Add BetterAuth env vars**

```bash
# Add to .env:
BETTER_AUTH_SECRET=<your-secret>  # Can reuse NEXTAUTH_SECRET
BETTER_AUTH_URL=http://localhost:3000
```

**Step 2: Document in `.env.example`**

```bash
BETTER_AUTH_SECRET=your-secret-here-at-least-32-chars
BETTER_AUTH_URL=http://localhost:3000
```

**Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add BetterAuth environment variables"
```

---

## Task 16: Final Verification

**Step 1: Full TypeScript check**

```bash
npx tsc --noEmit --pretty
```

Expected: Zero errors in production code.

**Step 2: Search for any remaining NextAuth references**

```bash
grep -r "next-auth" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
grep -r "@/auth" src/ --include="*.ts" --include="*.tsx" | grep -v "@/lib/auth" | grep -v node_modules
```

Expected: Zero results.

**Step 3: Verify the dev server starts**

```bash
npm run dev
```

Test manually:

- Visit `/login` — should show login form
- Login with credentials — should redirect to `/dashboard`
- Check session persistence — refresh page, still logged in
- Sign out — redirected to `/login`

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete NextAuth to BetterAuth migration"
```
