import { runAgentCycle } from "@/lib/agent";
import { ApiError, apiErrorResponse, isApiAuthorized, okJson, readJsonBody, requestId, unauthorized } from "@/lib/api-security";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

type RunPayload = { limit?: number; override?: boolean };

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    if (!isApiAuthorized(request)) return unauthorized(id);
    await ensureSeeded();
    const { data: body } = await readJsonBody<RunPayload>(request);
    const limit = body.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new ApiError(400, "invalid_limit", "limit must be an integer from 1 to 50");
    }
    const result = await runAgentCycle({ limit, force: true, override: Boolean(body.override) });
    return okJson({ result }, id);
  } catch (error) {
    return apiErrorResponse(error, id);
  }
}
