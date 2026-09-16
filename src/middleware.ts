import { NextRequest, NextResponse } from "next/server";

// Simple in-memory token bucket for middleware (edge-safe, no node:crypto).
// Mirrors the 60 req/min per IP policy in src/lib/api-security.ts but
// keeps middleware self-contained so it runs in the Edge runtime.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

function checkRateLimit(ip: string): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    store.set(ip, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, resetAt: entry.resetAt };
  }
  entry.count += 1;
  return { allowed: true, resetAt: entry.resetAt };
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? (request as unknown as { ip?: string }).ip ?? "anonymous";
}

export function middleware(request: NextRequest): NextResponse {
  const requestId = request.headers.get("x-request-id")?.slice(0, 80) || crypto.randomUUID();

  const ip = getClientIp(request);
  const { allowed, resetAt } = checkRateLimit(ip);

  if (!allowed) {
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { ok: false, error: { code: "rate_limited", message: "Too many requests" }, requestId },
      {
        status: 429,
        headers: {
          "x-request-id": requestId,
          "retry-after": String(retryAfter),
          "x-ratelimit-remaining": "0",
        },
      },
    );
  }

  // Propagate x-request-id downstream: set on request headers + response headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
