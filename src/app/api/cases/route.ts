import { ApiError, apiErrorResponse, isApiAuthorized, okJson, requestId, unauthorized } from "@/lib/api-security";
import { listCasesPage } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    if (!isApiAuthorized(request)) return unauthorized(id);
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? 1);
    const limit = Number(searchParams.get("limit") ?? 25);
    const minBalance = Number(searchParams.get("minBalance") ?? 0);
    if (![page, limit, minBalance].every(Number.isFinite) || page < 1 || limit < 1 || minBalance < 0) {
      throw new ApiError(400, "invalid_pagination", "page, limit and minBalance must be positive numbers");
    }

    const result = await listCasesPage({
      page,
      limit,
      status: searchParams.get("status"),
      query: searchParams.get("q"),
      minBalanceCents: Math.round(minBalance * 100),
    });

    return okJson(
      {
        pagination: { page: result.page, limit: result.limit, total: result.total, pages: result.pages },
        outstandingCents: result.rows.reduce((sum, row) => sum + row.balanceCents, 0),
        cases: result.rows,
      },
      id,
    );
  } catch (error) {
    return apiErrorResponse(error, id);
  }
}
