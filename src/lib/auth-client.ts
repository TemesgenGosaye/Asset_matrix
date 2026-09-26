/**
 * BetterAuth React client
 *
 * Client-side auth hooks and methods for use in React components.
 */

import { createAuthClient } from "better-auth/react";
import {
  twoFactorClient,
  // 💡 genericOAuthClient has been removed as it is now native to social providers
} from "better-auth/client/plugins";

/** User fields available in BetterAuth session (includes additionalFields) */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  twoFactorEnabled?: boolean;
  // Custom additionalFields
  firstname?: string;
  lastname?: string;
  username?: string;
  isadmin?: boolean;
  canrequest?: boolean;
  organizationId?: string;
  departmentId?: string;
  authProvider?: string;
  isActive?: boolean;
  mfaEnabled?: boolean;
}

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  plugins: [
    twoFactorClient(),
    // 💡 Removed genericOAuthClient() initialization
  ],
});

// Re-export commonly used methods for convenience.
// NOTE: useSession/signOut are wrapped so callers get stable, readable types
// (better-auth 1.6.9 + TS6 generic inference resolves the session payload to `never`).
export const signIn = authClient.signIn;

export function useSession(): {
  data: { user: SessionUser } | null;
  isPending: boolean;
} {
  const { data, isPending } = authClient.useSession();
  return { data: (data as { user: SessionUser } | null) ?? null, isPending };
}

export const signOut = async (): Promise<void> => {
  await authClient.signOut({});
};
