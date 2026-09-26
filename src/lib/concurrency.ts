import { NextResponse } from "next/server";

const CONFLICT_MESSAGE =
  "This item was modified by another user. Please refresh and try again.";

/**
 * Compare an expected version timestamp against the entity's current timestamp.
 * Returns `true` when the versions match (or when no check is needed).
 */
export function checkVersion(
  expected: string | undefined,
  current: Date | null | undefined,
): boolean {
  if (!expected || !current) return true;
  return new Date(expected).getTime() === new Date(current).getTime();
}

/**
 * If `_expectedVersion` is present in the body and does not match `current`,
 * returns a 409 Conflict response. Otherwise returns `null` (proceed normally).
 */
export function conflictResponse(
  expectedVersion: string | undefined,
  current: Date | null | undefined,
): NextResponse | null {
  if (checkVersion(expectedVersion, current)) return null;
  return NextResponse.json({ error: CONFLICT_MESSAGE }, { status: 409 });
}

export { CONFLICT_MESSAGE };
