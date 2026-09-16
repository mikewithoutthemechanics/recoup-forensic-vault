/**
 * Environment validation (manual zod-like).
 * Centralises access to process.env so callers can import `env` instead of
 * reading process.env inline. Validation is intentionally lightweight — we
 * surface clear errors for required keys and normalise optional ones with
 * safe fallbacks so local/demo mode keeps working without secrets.
 *
 * TODO: Swap manual validators for zod once the dependency is added if the
 * team prefers schema-based parsing. The public `env` shape should remain
 * identical.
 */

// ---------------------------------------------------------------------------
// Helpers — tiny zod-like primitives
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  return value.trim();
}

function requiredString(name: string, value: unknown): string {
  if (!isNonEmptyString(value)) {
    // Keep message actionable and consistent with zod's `required_error`
    throw new Error(`[env] ${name} is required but was not set`);
  }
  return value.trim();
}

function optionalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    // Throws on malformed URLs — surfaces misconfiguration early
    new URL(value);
    return value.trim();
  } catch {
    throw new Error(`[env] PAY_BASE_URL must be a valid URL, got "${value}"`);
  }
}

function normalisePayBaseUrl(raw: string | undefined): string {
  const fallback = "https://pay.recoup.africa/r/";
  const candidate = optionalString(raw) ?? fallback;
  const parsed = optionalUrl(candidate) ?? fallback;
  // Ensure exactly one trailing slash so callers can do `${PAY_BASE_URL}${token}`
  return parsed.endsWith("/") ? parsed : `${parsed}/`;
}

// ---------------------------------------------------------------------------
// Parse + validate
// ---------------------------------------------------------------------------

function parseEnv() {
  const raw = {
    DATABASE_URL: process.env.DATABASE_URL,
    RECOUP_API_KEY: process.env.RECOUP_API_KEY,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    PAY_BASE_URL: process.env.PAY_BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    // Passthrough for LLM tuning without strict validation
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  } as const;

  // Manual "schema" — add new env vars here as the platform grows
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const DATABASE_URL = isNonEmptyString(raw.DATABASE_URL) ? raw.DATABASE_URL.trim() : isBuild ? "postgresql://placeholder:placeholder@localhost:5432/placeholder_build" : undefined;
  if (!DATABASE_URL) {
    // In local/demo and during `tsc --noEmit` the pool is not instantiated,
    // so we warn rather than hard-crash the import graph. `src/db/index.ts`
    // still enforces a hard error when a connection is actually attempted.
    if (process.env.NODE_ENV === "production" && !isBuild) {
      throw new Error("[env] DATABASE_URL is required in production");
    }
  }

  // Optional secrets — allowed to be undefined in demo mode
  const RECOUP_API_KEY = optionalString(raw.RECOUP_API_KEY);
  const WEBHOOK_SECRET = optionalString(raw.WEBHOOK_SECRET);
  const OPENAI_API_KEY = optionalString(raw.OPENAI_API_KEY);
  const ANTHROPIC_API_KEY = optionalString(raw.ANTHROPIC_API_KEY);

  // URL with fallback + normalisation
  const PAY_BASE_URL = normalisePayBaseUrl(raw.PAY_BASE_URL);

  if (RECOUP_API_KEY && RECOUP_API_KEY.length < 16) {
    // Soft warning — not a hard throw so existing short demo keys keep working
    console.warn("[env] RECOUP_API_KEY looks short (<16 chars); verify rotation policy");
  }

  return {
    DATABASE_URL: DATABASE_URL ?? "",
    RECOUP_API_KEY,
    WEBHOOK_SECRET,
    PAY_BASE_URL,
    OPENAI_API_KEY,
    ANTHROPIC_API_KEY,
    OPENAI_BASE_URL: optionalString(raw.OPENAI_BASE_URL),
    OPENAI_MODEL: optionalString(raw.OPENAI_MODEL),
    ANTHROPIC_MODEL: optionalString(raw.ANTHROPIC_MODEL),
    // Convenience flag used by callers that need demo-mode branching
    isDemoMode: !RECOUP_API_KEY && !WEBHOOK_SECRET,
  } as const;
}

export const env = parseEnv();

export type Env = typeof env;
