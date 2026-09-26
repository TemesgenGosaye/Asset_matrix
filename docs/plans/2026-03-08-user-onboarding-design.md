# User Onboarding Improvements Design

## Goals

1. Unified "Add User" form with generate-password + magic link
2. Configurable social/SSO login providers (Microsoft Entra ID, Google, GitHub, Apple)
3. Admin settings page to enable/disable providers

---

## 1. Unified "Add User" Form

Redesign `/user/create` with three password modes (radio selection):

### Mode A: Generate Password (recommended default)

- Generate a cryptographically secure random password (16 chars, mixed case + numbers + symbols)
- Show password once in a readonly field with a copy button
- Send a magic link email to the user so they can set their own password
- The generated password serves as emergency/fallback access only

### Mode B: Set Password Manually

- Current behavior: admin types a password
- Also sends the magic link email so user can set their own

### Mode C: Send Invitation Only

- No password set at creation time
- Reuses the existing team invitation flow (`POST /api/team/invite`)
- User receives invitation email, clicks link, creates their own password

### Magic Link "Set Password" Flow

- New route: `/set-password/[token]`
- New API: `POST /api/auth/set-password` (validates token, sets password)
- Token stored in `verification` table (reuse BetterAuth's existing table)
- Token expires after 72 hours
- New email template: `setPassword` with magic link
- After setting password, redirect to login page

### UI Changes

- Radio group at top of security section: "Generate password" | "Set manually" | "Invite only"
- Generate mode: "Generate" button + readonly password field + copy button
- Manual mode: current password input fields
- Invite mode: hides password section entirely, shows info text
- All modes except "Set manually" require an email address (for sending the link)

---

## 2. Configurable SSO Providers

### Supported Providers

| Provider           | BetterAuth Plugin | Config Fields                                     |
| ------------------ | ----------------- | ------------------------------------------------- |
| Microsoft Entra ID | `microsoft`       | clientId, clientSecret, tenantId                  |
| Google Workspace   | `google`          | clientId, clientSecret                            |
| GitHub             | `github`          | clientId, clientSecret                            |
| Apple              | `apple`           | clientId, clientSecret, teamId, keyId, privateKey |

### Storage

- Provider configs stored encrypted in `system_settings` table (AES-256-GCM)
- Same encryption pattern as email provider config
- Keys: `sso.microsoft.enabled`, `sso.microsoft.clientId`, `sso.microsoft.clientSecret`, etc.

### Auth Server Changes

- `src/lib/auth-server.ts`: load enabled providers from DB at startup
- Register BetterAuth social provider plugins dynamically based on what's enabled
- Fallback to env vars (`MICROSOFT_CLIENT_ID`, etc.) if DB config not set

### Auto-Create Setting

- `sso.autoCreateUsers` setting (boolean, default: false)
- When enabled: SSO login auto-creates a new user (role: requester, canrequest: true)
- When disabled: only pre-existing users (matched by email) can log in via SSO
- New users auto-linked to the organization based on admin config

---

## 3. Admin Settings Page

### New Route: `/admin/settings/authentication`

#### SSO Providers Section

For each provider:

- Enable/disable toggle
- Client ID input
- Client Secret input (masked)
- Provider-specific fields (Tenant ID for Microsoft, etc.)
- "Save" button per provider
- Help text with link to provider's app registration docs
- Connection test button (attempts OAuth flow in popup)

#### Auto-Create Section

- Toggle: "Allow new users from SSO login"
- Default role selector (when auto-create is on)
- Info text explaining the behavior

### Login Page Changes

- Query enabled providers from API: `GET /api/auth/providers`
- Dynamically render provider buttons above the email/password form
- Horizontal divider with "or" text between SSO buttons and form
- Provider buttons use each provider's brand colors/icons

---

## API Endpoints

| Method | Path                       | Purpose                             |
| ------ | -------------------------- | ----------------------------------- |
| GET    | `/api/auth/providers`      | List enabled SSO providers (public) |
| GET    | `/api/admin/settings/auth` | Get auth settings (admin)           |
| PUT    | `/api/admin/settings/auth` | Update auth settings (admin)        |
| POST   | `/api/auth/set-password`   | Set password via magic link token   |
| GET    | `/set-password/[token]`    | Set password page                   |

---

## Security Considerations

- Never send passwords via email
- Magic link tokens: single-use, 72-hour expiry, cryptographically random
- SSO secrets encrypted at rest (AES-256-GCM)
- Auto-create disabled by default (admin must opt in)
- Audit log entries for SSO config changes
