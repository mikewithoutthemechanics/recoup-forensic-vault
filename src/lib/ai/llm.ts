import { env } from "@/lib/env";

/**
 * Optional LLM polish layer. The product works fully without an API key —
 * templates + the deterministic engine always produce a compliant draft, and
 * the LLM is only used to re-phrase copy when a key is configured.
 *
 * Provider abstraction: env.OPENAI_API_KEY / env.ANTHROPIC_API_KEY are the
 * source of truth (see src/lib/env.ts), with a process.env fallback so
 * the module still works if env.ts has not yet been imported. Preference
 * order is OpenAI > Anthropic to keep costs predictable.
 *
 * TODO(LLM): wire a real provider SDK + prompt registry. This fetch-based
 * stub is sufficient for copy polishing and keeps the bundle free of heavy
 * SDKs until usage justifies it.
 */
export function llmProvider(): "openai" | "anthropic" | null {
  const openaiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (openaiKey) return "openai";
  if (anthropicKey) return "anthropic";
  return null;
}

const SYSTEM = [
  "You are a South African accounts-receivable communications specialist.",
  "Rewrite the draft so it is warm, concise, respectful and compliant with POPIA and the Consumer Protection Act.",
  "Never threaten legal action, never imply credit bureau listing, never add fees or interest.",
  "Keep every factual detail (amounts, invoice numbers, payment links, references, opt-out line) exactly as provided.",
  "Match the requested channel length: WhatsApp/SMS under 60 words, email under 160 words.",
  "Return only the rewritten message text.",
].join(" ");

export async function refineDraft(draft: string, context: string): Promise<string | null> {
  const provider = llmProvider();
  if (!provider) return null;
  const prompt = `Context: ${context}\n\nDraft to improve:\n"""\n${draft}\n"""`;

  // Graceful fallback: any network, auth or parsing error returns null and
  // the caller should fall back to the deterministic template draft.
  try {
    if (provider === "openai") {
      const apiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
      const baseUrl = env.OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
      const model = env.OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      if (!apiKey) return null;
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 500,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content?.trim() ?? null;
    }

    const anthropicKey = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    const anthropicModel = env.ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
    if (!anthropicKey) return null;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { text?: string }[] };
    return json.content?.[0]?.text?.trim() ?? null;
  } catch {
    // Network timeout, abort, JSON parse — degrade silently to template
    return null;
  }
}
