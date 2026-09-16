import { handleInbound } from "@/lib/agent";
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

type InboundPayload = {
  caseId?: number;
  channel?: string;
  message?: string;
  body?: string;
  eventId?: string;
  messageId?: string;
};

const CHANNELS = new Set(["whatsapp", "sms", "email", "voice"]);

/**
 * Inbound message webhook for WhatsApp, SMS, email and voice transcripts.
 * Provider retries are safe when eventId/messageId is supplied.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const { raw, data: body } = await readJsonBody<InboundPayload>(request);
    if (!isWebhookAuthorized(request, raw)) return unauthorized(id);

    const text = (body.message ?? body.body)?.trim();
    const caseId = Number(body.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0 || !text) {
      throw new ApiError(400, "invalid_message", "A positive caseId and non-empty message are required");
    }
    if (text.length > 10_000) throw new ApiError(400, "message_too_long", "Message must be 10,000 characters or less");
    if (body.channel && !CHANNELS.has(body.channel)) {
      throw new ApiError(400, "invalid_channel", "channel must be whatsapp, sms, email or voice");
    }

    const result = await handleInbound({
      caseId,
      body: text,
      channel: body.channel,
      externalId: (body.eventId ?? body.messageId)?.trim() || undefined,
    });

    return okJson(
      {
        duplicate: Boolean(result.duplicate),
        intent: result.classification.intent,
        confidence: result.classification.confidence,
        sentiment: result.classification.sentiment,
        routeToHuman: result.classification.routeToHuman,
        action: result.action,
        autoReply: result.autoReply,
      },
      id,
    );
  } catch (error) {
    return apiErrorResponse(error, id);
  }
}
