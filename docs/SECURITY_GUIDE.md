# Security Implementation Guide

This guide documents security gaps found in the current codebase and a prioritized implementation plan to address them. It is intended to be used alongside `FEATURES.md`.

## 1) Immediate Fixes (P0)

### 1.1 Lock Down Unauthenticated API Routes

**Problem:** Several API routes allow unauthenticated read/write access to sensitive data.

**Actions:**

- Require authentication (`requireApiAuth`) on **all** API routes.
- Require admin (or RBAC permission) on create/update/delete routes.
- Remove or refactor legacy endpoints that bypass auth.

**Targets:**

- `src/app/api/asset/route.ts` (GET/POST/PUT)
- `src/app/api/user/route.ts` (GET/PUT)
- `src/app/api/user/getUser/route.ts`
- `src/app/api/asset/validate/route.ts`
- `src/app/api/user/validate/route.ts`

### 1.2 Fix Password Handling on User Updates

**Problem:** User updates accept a raw password and write it un-hashed.

**Actions:**

- Hash any password updates using `hashPassword`.
- Never return passwords in API responses.
- Prevent non-admins from updating `isadmin` or `canrequest`.

**Targets:**

- `src/app/api/user/route.ts`

### 1.3 Prevent Mass Assignment

**Problem:** Some update endpoints use `...data` without whitelisting fields.

**Actions:**

- Use Zod schemas for update payloads.
- Explicitly whitelist allowed fields.
- Reject unexpected keys (strict schema).

**Targets:**

- `src/app/api/asset/route.ts`
- `src/app/api/user/route.ts`

## 2) High Priority (P1)

### 2.1 File Upload Hardening

**Problem:** Asset attachments allow arbitrary file uploads to a public directory without validation.

**Actions:**

- Restrict allowed MIME types (e.g., images/pdf only).
- Enforce size limits (e.g., 5–10 MB).
- Sanitize filenames and strip path separators.
- Store uploads outside `public/` and serve via signed URLs.
- Verify user authorization to the asset before upload/delete.

**Targets:**

- `src/app/api/asset/attachments/route.ts`
- `src/app/api/asset/attachments/[id]/route.ts`

### 2.2 Organization Scoping

**Problem:** Multi-tenant tables exist but many queries are not scoped by `organizationId`.

**Actions:**

- Add org scoping for all queries on org-scoped entities.
- Enforce org membership on API routes.
- Add automated tests for cross-tenant access.

**Example Targets:**

- `src/app/api/organizations/route.ts`
- `src/app/api/organizations/[id]/route.ts`
- `src/app/api/search/route.ts`
- `src/app/api/stock-alerts/route.ts`

### 2.3 User Enumeration Protection

**Problem:** Username/email validation endpoints allow unauthenticated enumeration.

**Actions:**

- Require authentication.
- Consider returning generic responses to reduce enumeration risk.

**Targets:**

- `src/app/api/user/validate/route.ts`
- `src/app/api/asset/validate/route.ts`

## 3) Medium Priority (P2)

### 3.1 Secrets Management

**Problem:** API keys are stored in DB without encryption.

**Actions:**

- Encrypt secrets at rest (KMS/Vault).
- Only display masked values in UI.
- Add rotation procedures.

**Targets:**

- `src/app/api/admin/settings/email/route.ts`

### 3.2 CSRF Protection

**Problem:** Cookie-based sessions on state-changing endpoints can be vulnerable to CSRF.

**Actions:**

- Add CSRF tokens or same-site strict validation on mutating requests.
- Enforce `Origin`/`Referer` checks for browser POST/PUT/PATCH/DELETE.

### 3.3 Security Headers

**Actions:**

- Add CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- Automate security header testing in CI.

## 4) Long-Term Hardening (P3)

- MFA/2FA and password reset flows
- Concurrent session management
- Captcha for auth endpoints
- Suspicious activity detection
- Enhanced audit logging (entity diffs)
- Data masking in logs
- Compliance reporting (SOX/HIPAA/GDPR)

## 5) Security Baseline Checklist

- [ ] All API routes protected with auth and role checks
- [ ] All mutations validated with strict Zod schemas
- [ ] No plaintext secrets in DB
- [ ] File uploads restricted and scanned
- [ ] Multi-tenant scoping enforced
- [ ] CSRF protection on mutating requests
- [ ] Security headers enforced
- [ ] Audit logging enabled

## 6) Recommended Implementation Order

1. Lock down unauthenticated routes and hash passwords on update.
2. Add strict input validation + deny-by-default field updates.
3. Harden file uploads (type/size/authorization/storage).
4. Enforce organization scoping.
5. Add CSRF and security headers.
6. Encrypt secrets + rotation.
