import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_BYTES = 64 * 1024;

// ---------------------------------------------------------------------------
// Rate limiting: simple in-memory token bucket — 60 req/min per IP
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
type RateEntry = { count: number; resetAt: number };
const rateLimitStore = new Map<string, RateEntry>();

/** Returns whether `ip` is within the 60 req/min budget. Side-effect: increments bucket. */
export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt };
}

/** Clears expired buckets — called lazily to bound memory in long-lived servers. */
export function pruneRateLimitStore(now = Date.now()): void {
  for (const [k, v] of rateLimitStore) {
    if (now > v.resetAt) rateLimitStore.delete(k);
  }
  // Opportunistic prune when store grows large
  if (rateLimitStore.size > 10_000) {
    for (const [k, v] of rateLimitStore) {
      if (now > v.resetAt) rateLimitStore.delete(k);
    }
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const lenEqual = left.length === right.length;
  // Always perform a timingSafeEqual over equal-length buffers to avoid
  // leaking length via early return. Pad the shorter buffer with zeros.
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return true;
  const aPadded = Buffer.alloc(maxLen, 0);
  const bPadded = Buffer.alloc(maxLen, 0);
  left.copy(aPadded);
  right.copy(bPadded);
  const contentsEqual = timingSafeEqual(aPadded, bPadded);
  return lenEqual && contentsEqual;
}

/** Protects machine-to-machine APIs when RECOUP_API_KEY is configured. */
export function isApiAuthorized(request: Request): boolean {
  const expected = process.env.RECOUP_API_KEY;
  if (!expected) {
    // In production missing secret must fail closed; in dev/demo allow frictionless access.
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(supplied) && constantTimeEqual(supplied, expected);
}

/** Verifies `x-recoup-signature: sha256=<hex>` when WEBHOOK_SECRET is set. */
export function isWebhookAuthorized(request: Request, rawBody: string): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const supplied = (request.headers.get("x-recoup-signature") ?? "").replace(/^sha256=/i, "").trim();
  if (!supplied) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return constantTimeEqual(supplied, expected);
}

export async function readJsonBody<T>(request: Request): Promise<{ raw: string; data: T }> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) throw new ApiError(413, "payload_too_large", "Payload exceeds 64 KB");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BYTES) {
    throw new ApiError(413, "payload_too_large", "Payload exceeds 64 KB");
  }
  try {
    return { raw, data: JSON.parse(raw || "{}") as T };
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function requestId(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 80) || crypto.randomUUID();
}

export function apiErrorResponse(error: unknown, id: string): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message }, requestId: id },
      { status: error.status, headers: { "x-request-id": id } },
    );
  }
  console.error(`[api:${id}]`, error);
  return Response.json(
    {
      ok: false,
      error: {
        code: "internal_error",
        message: process.env.NODE_ENV === "production" ? "The request could not be completed" : (error as Error).message,
      },
      requestId: id,
    },
    { status: 500, headers: { "x-request-id": id } },
  );
}

export function unauthorized(id: string): Response {
  return Response.json(
    { ok: false, error: { code: "unauthorized", message: "Valid API credentials are required" }, requestId: id },
    { status: 401, headers: { "www-authenticate": "Bearer", "x-request-id": id } },
  );
}

export function okJson(payload: Record<string, unknown>, id: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("x-request-id", id);
  headers.set("cache-control", "no-store");
  return Response.json({ ok: true, ...payload, requestId: id }, { ...init, headers });
}
