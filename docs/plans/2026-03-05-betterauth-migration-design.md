# NextAuth → BetterAuth Migration Design

**Date:** 2026-03-05
**Status:** Approved
**Motivation:** NextAuth v5 beta instability, BetterAuth's built-in plugins, future-proofing (Auth.js team joined BetterAuth)

## Decisions

- **Approach:** Full swap — replace NextAuth entirely with BetterAuth
- **Sessions:** Database-backed with 5-minute cookie cache (not JWT)
- **Multi-tenancy:** Keep custom `scopeToOrganization` pattern (30+ routes depend on it)
- **LDAP:** Keep custom `ldap.ts` module, wire into BetterAuth's sign-in hooks
- **MFA:** Adopt BetterAuth's `twoFactor` plugin (replaces custom HMAC challenge system)
- **SSO:** Adopt BetterAuth's `sso` plugin (replaces custom SAML/OIDC code)
- **SCIM:** Evaluate BetterAuth's SCIM support; keep custom if needed

## Architecture

### Core Auth Setup

**New files:**

- `src/lib/auth.ts` — BetterAuth server instance
- `src/lib/auth-client.ts` — BetterAuth React client
- `src/app/api/auth/[...all]/route.ts` — Catch-all handler

**Server instance:**

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins/two-factor";
import { sso } from "better-auth/plugins/sso";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [twoFactor({ issuer: "AssetTracker" }), sso()],
});
```

**Client:**

```typescript
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient();
```

### Database Schema Changes

**`user` table:** Add `emailVerified` Boolean. Keep all custom columns.

**`sessions` table:**

- `sessionToken` → `token`
- `expires` → `expiresAt`
- Keep: `ipAddress`, `userAgent`, `deviceName`, `lastActive`, `isCurrent`

**`accounts` table:**

- `provider` → `providerId`
- `providerAccountId` → `accountId`
- Add: `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `idToken`, `password`

**`verification_tokens` → `verification`:**

- Add `id` primary key
- `token` → `value`
- Add `expiresAt`, `updatedAt`

**New tables:** `twoFactor` (from 2FA plugin)

### Authentication Flows

**Local credentials:** BetterAuth `emailAndPassword` with bcrypt.

**LDAP:** Custom `beforeEmailSignIn` hook checks `authProvider === "ldap"`, calls `ldap.authenticateUser()`.

**MFA:** BetterAuth `twoFactor` plugin handles TOTP setup, verification, backup codes, and device trust.

**SSO:** BetterAuth `sso` plugin handles SAML 2.0 and OIDC flows, replacing custom `sso.ts`, `sso-init`, and callback routes.

**SCIM:** Evaluate BetterAuth's SCIM plugin; may keep custom `scim.ts` if more control is needed.

### Auth Guards (Zero-Change Interface)

The `api-auth.ts` guard functions (`requireApiAuth`, `requirePermission`, `requireApiAdmin`) keep the same external interface. Internally they switch from NextAuth's `auth()` to:

```typescript
const session = await auth.api.getSession({ headers: await headers() });
const user = await prisma.user.findUnique({
  where: { userid: session.user.id },
});
```

**30+ API routes using these guards need no changes.**

### Client-Side Changes

| Before (NextAuth)              | After (BetterAuth)               |
| ------------------------------ | -------------------------------- |
| `<SessionProvider>` wrapper    | No wrapper needed                |
| `useSession()`                 | `authClient.useSession()`        |
| `signIn("credentials", {...})` | `authClient.signIn.email({...})` |
| `signOut({ callbackUrl })`     | `authClient.signOut()`           |

### Middleware

Replace NextAuth's `authorized` callback with lightweight cookie check:

```typescript
import { getSessionCookie } from "better-auth/cookies";
// Optimistic check — no DB call in middleware
const session = getSessionCookie(request);
```

MFA pending state checked via twoFactor plugin session metadata.

## Files Impact Summary

| Category         | Files                                                            | Change                            |
| ---------------- | ---------------------------------------------------------------- | --------------------------------- |
| Core auth        | `auth.ts`, `auth.config.ts`, `auth-client.ts`                    | Rewrite                           |
| Route handler    | `[...nextauth]` → `[...all]`                                     | Rewrite                           |
| Auth guards      | `api-auth.ts`, `auth-guards.ts`                                  | Internal rewrite, same interface  |
| Session mgmt     | `session-tracking.ts`, `session-timeout.ts`                      | Adapt to new session model        |
| MFA              | `mfa.ts`, `api/auth/mfa/*`                                       | Remove (plugin replaces)          |
| SSO              | `sso.ts`, SSO routes                                             | Remove (plugin replaces)          |
| SCIM             | `scim.ts`, SCIM routes                                           | Keep or replace                   |
| Components       | `SessionProvider`, `SignOutButton`, `LoginForm`, `MfaVerifyForm` | Rewrite                           |
| Types            | `next-auth.d.ts`                                                 | Remove                            |
| Prisma schema    | `schema.prisma`                                                  | Column renames + new tables       |
| API routes (30+) | Routes using auth guards                                         | **No changes**                    |
| Dependencies     | `package.json`                                                   | Remove next-auth, add better-auth |

## Risk Mitigation

- Auth guard interface stays identical → 30+ routes untouched
- Custom LDAP/multi-tenancy kept → no enterprise feature regression
- DB migration is additive (renames + new columns) → reversible
- BetterAuth has official NextAuth migration guide
