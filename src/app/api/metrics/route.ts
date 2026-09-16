import { apiErrorResponse, isApiAuthorized, okJson, requestId, unauthorized } from "@/lib/api-security";
import { agingBreakdown, categoryBreakdown, channelPerformance, computeKpis, loadPortfolio, weeklyRecovery } from "@/lib/data";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    if (!isApiAuthorized(request)) return unauthorized(id);
    await ensureSeeded();
    const portfolio = await loadPortfolio();
    return okJson(
      {
        currency: portfolio.org.currency,
        kpis: computeKpis(portfolio),
        aging: agingBreakdown(portfolio),
        channels: channelPerformance(portfolio),
        byCategory: categoryBreakdown(portfolio),
        weekly: weeklyRecovery(portfolio, 10),
      },
      id,
    );
  } catch (error) {
    return apiErrorResponse(error, id);
  }
}
