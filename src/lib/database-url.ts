type Env = Record<string, string | undefined>;

const DATABASE_URL_KEYS = [
  "DATABASE_URL",
  "DATABASE_NEOND_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DIRECT_URL",
] as const;

const VERCEL_DATABASE_URL_KEYS = [
  "DATABASE_NEOND_URL",
  ...DATABASE_URL_KEYS,
] as const;

const DIRECT_DATABASE_URL_KEYS = [
  "DATABASE_NEOND_DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DIRECT_URL",
] as const;

function readUrl(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function isVercel(env: Env): boolean {
  return Boolean(env.VERCEL || env.VERCEL_ENV);
}

export function isLocalDatabaseUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function resolveDatabaseUrl(env: Env = process.env): string {
  const keys = isVercel(env) ? VERCEL_DATABASE_URL_KEYS : DATABASE_URL_KEYS;
  const candidates = keys
    .map((key) => readUrl(env, key))
    .filter((value): value is string => Boolean(value));

  if (isVercel(env)) {
    const remote = candidates.find((value) => !isLocalDatabaseUrl(value));
    if (remote) return remote;
  }

  return candidates[0] ?? "";
}

/**
 * Prisma migrations cannot run through Neon's PgBouncer pooler, so prefer a
 * direct/unpooled URL when one is configured. If only a pooled Neon URL is
 * available, derive the direct host by removing the `-pooler` label.
 */
export function resolveMigrationDatabaseUrl(env: Env = process.env): string {
  for (const key of DIRECT_DATABASE_URL_KEYS) {
    const value = readUrl(env, key);
    if (!value) continue;
    if (isVercel(env) && isLocalDatabaseUrl(value)) continue;
    return value;
  }

  const url = resolveDatabaseUrl(env);
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.endsWith(".neon.tech") &&
      parsed.hostname.includes("-pooler.")
    ) {
      parsed.hostname = parsed.hostname.replace("-pooler.", ".");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
