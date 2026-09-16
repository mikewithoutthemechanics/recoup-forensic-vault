import { eq } from "drizzle-orm";

import { db } from "@/db";
import { paymentRequests } from "@/db/schema";
import { recordPayment } from "@/lib/agent";
import {
  ApiError,
  apiErrorResponse,
  isWebhookAuthorized,
  okJson,
  readJsonBody,
  requestId,
  unauthorized,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";

type PaymentPayload = {
  token?: string;
  eventId?: string;
  amountCents?: number;
  method?: string;
};

/**
 * Payment webhook — PayShap / card link / EFT bank feed callback.
 * Sign the raw body with WEBHOOK_SECRET and send x-recoup-signature: sha256=<hex>.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const { raw, data: body } = await readJsonBody<PaymentPayload>(request);
    if (!isWebhookAuthorized(request, raw)) return unauthorized(id);

    const token = body.token?.trim();
    if (!token) throw new ApiError(400, "missing_token", "token is required");
    if (body.amountCents !== undefined && (!Number.isInteger(body.amountCents) || body.amountCents <= 0)) {
      throw new ApiError(400, "invalid_amount", "amountCents must be a positive integer");
    }

    const [paymentRequest] = await db.select().from(paymentRequests).where(eq(paymentRequests.token, token)).limit(1);
    if (!paymentRequest) throw new ApiError(404, "request_not_found", "Unknown payment request");

    const providerEventId = body.eventId?.trim() || `${body.method ?? paymentRequest.method}:${token}`;
    const result = await recordPayment({
      caseId: paymentRequest.caseId,
      invoiceId: paymentRequest.invoiceId,
      paymentRequestId: paymentRequest.id,
      providerEventId,
      amountCents: body.amountCents ?? paymentRequest.amountCents,
      method: body.method ?? paymentRequest.method,
      reference: paymentRequest.reference,
      attributedTo: "ai",
    });

    return okJson(
      {
        duplicate: result.duplicate,
        recoveredCents: result.amount,
        remainingCents: result.newBalance,
      },
      id,
    );
  } catch (error) {
    return apiErrorResponse(error, id);
  }
}
