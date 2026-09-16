import { timingSafeEqual } from "node:crypto";

import { runAgentCycle } from "@/lib/agent";
import { apiErrorResponse, okJson, requestId, unauthorized } from "@/lib/api-security";

export const dynamic = "force-dynamic";

// Vercel cron config (vercel.json):
// {
//   "crons": [{ "path": "/api/cron", "schedule": "0 8 * * *" }]
// }
// Vercel will call GET /api/cron with header `x-cron-secret` if you set CRON_SECRET
// in project env. Keep the secret ≥32 chars and rotate via env, never in code.

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const lenEqual = left.length === right.length;
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return true;
  const aPadded = Buffer.alloc(maxLen, 0);
  const bPadded = Buffer.alloc(maxLen, 0);
  left.copy(aPadded);
  right.copy(bPadded);
  const contentsEqual = timingSafeEqual(aPadded, bPadded);
  return lenEqual && contentsEqual;
}

function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed in production; allow in dev/demo for local curl without secret
    return process.env.NODE_ENV !== "production";
  }
  const supplied = request.headers.get("x-cron-secret") ?? "";
  return Boolean(supplied) && constantTimeEqual(supplied, expected);
}

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    if (!isCronAuthorized(request)) return unauthorized(id);
    const result = await runAgentCycle({ limit: 12 });
    return okJson({ result }, id);
  } catch (error) {
    return apiErrorResponse(error, id);
  }
}
