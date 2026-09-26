/**
 * Re-export BetterAuth server instance.
 * Allows importing as `@/lib/auth` throughout the codebase.
 */
export { auth } from "./auth-server";
export type { Session, User } from "./auth-server";
