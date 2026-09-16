import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * PayShap provider abstraction.
 *
 * The platform today generates self-hosted payment links of the form
 * `${PAY_BASE_URL}${token}` and records a `paymentRequests` row. A real
 * PayShap / banking partner will eventually mint hosted checkouts and call
 * back via webhooks. This interface is the seam for that provider so
 * `agent.ts` and webhook handlers never couple directly to a vendor SDK.
 *
 * TODO(Provider): Implement a live PayShap adapter (e.g. BankservAfrica
 * Rapid Payments) that:
 *  - authenticates via mTLS / API keys from env
 *  - calls the provider's create-request endpoint with amount, reference,
 *    creditor details and expiry
 *  - persists the provider's request id alongside our token for reconciliation
 *  - validates inbound webhook signatures with the provider's public key / HMAC
 */

export interface PayShapProvider {
  /**
   * Create a collectable payment request.
   * @param amountCents - ZAR cents, integer
   * @param reference - Human-readable invoice reference (e.g. INV-10231-A7F2)
   * @param token - Our internal secure token (base64url) included in the URL
   * @returns hosted URL the debtor opens and the expiry timestamp
   */
  createRequest(
    amountCents: number,
    reference: string,
    token: string,
  ): Promise<{ url: string; expiresAt: Date }>;

  /**
   * Verify that an inbound webhook body was signed by the provider.
   * Must use constant-time comparison and return false (not throw) on
   * malformed signatures so callers can map to 401 cleanly.
   */
  verifyWebhook(rawBody: string, signature: string): boolean;
}

/**
 * Stub implementation used in demo and tests.
 *
 * - `createRequest` builds a URL from `PAY_BASE_URL` (fallback
 *   https://pay.recoup.africa/r/) and returns a 7-day expiry so
 *   `agent.ts` can persist it without awaiting a network hop.
 * - `verifyWebhook` falls back to `WEBHOOK_SECRET` HMAC-SHA256
 *   (`sha256=<hex>`) when configured, otherwise accepts in demo mode where
 *   no secret is set. Replace with provider-specific signature logic.
 */
export const stubPayShapProvider: PayShapProvider = {
  async createRequest(amountCents, reference, token) {
    // TODO(Provider): replace with real PayShap API call; include amountCents
    // and reference in the provider payload, handle 4xx/5xx + retries.
    void amountCents;
    void reference;

    const base = env.PAY_BASE_URL; // already normalised to trailing slash by src/lib/env.ts
    // `env.PAY_BASE_URL` is guaranteed to end with `/`, so simple concat is safe
    const url = `${base}${token}`;

    // TODO(Provider): use the expiry returned by the provider instead of
    // the local 7-day default. Align with `paymentRequests.expiresAt` in agent.ts.
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    return { url, expiresAt };
  },

  verifyWebhook(rawBody, signature): boolean {
    const secret = env.WEBHOOK_SECRET ?? process.env.WEBHOOK_SECRET;
    if (!secret) {
      // Demo mode — no secret configured, accept the webhook but log once
      // so operators notice the gap before going live.
      // TODO(Provider): require a real secret/key in production and remove this branch
      return true;
    }

    const supplied = signature.replace(/^sha256=/i, "").trim();
    if (!supplied) return false;

    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

    const a = Buffer.from(supplied, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },
};

/**
 * Helper for callers that want a provider without importing the stub directly.
 * TODO(Provider): switch on env flag or dependency injection to return the
 * live provider when credentials are present.
 */
export function getPayShapProvider(): PayShapProvider {
  // TODO(Provider): if (env.PAYSHAP_API_KEY) return new LivePayShapProvider(env);
  return stubPayShapProvider;
}
