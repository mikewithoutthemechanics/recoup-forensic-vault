export type Intent =
  | "payment_made"
  | "promise_to_pay"
  | "negotiate"
  | "dispute"
  | "hardship"
  | "question"
  | "opt_out"
  | "wrong_contact"
  | "complaint"
  | "other";

export type Classification = {
  intent: Intent;
  confidence: number;
  sentiment: "positive" | "neutral" | "negative";
  amountCents: number | null;
  instalments: number | null;
  dateHint: string | null;
  routeToHuman: boolean;
  suggestedAction: string;
  matched: string[];
};

const RULES: { intent: Intent; weight: number; terms: string[] }[] = [
  {
    intent: "opt_out",
    weight: 4,
    terms: ["stop", "unsubscribe", "opt out", "do not contact", "dont contact", "remove me", "los my uit", "yeka", "musa ukungithinta"],
  },
  {
    intent: "payment_made",
    weight: 3,
    terms: ["paid", "payment made", "eft sent", "transferred", "proof of payment", "pop attached", "betaal", "ngikhokhile", "already settled", "sent the money"],
  },
  {
    intent: "dispute",
    weight: 3,
    terms: ["dispute", "incorrect", "wrong amount", "never received", "not my invoice", "double charged", "overcharged", "cancelled this", "verkeerd", "akulungile", "query the", "credit note"],
  },
  {
    intent: "negotiate",
    weight: 2.5,
    terms: ["payment plan", "instalment", "installment", "arrangement", "split it", "pay half", "part payment", "afbetaling", "ukukhokha kancane", "can i pay in"],
  },
  {
    intent: "hardship",
    weight: 2.5,
    terms: ["retrenched", "lost my job", "no income", "struggling", "hospital", "passed away", "sick", "hardship", "sukkel", "angisebenzi", "cash flow problem"],
  },
  {
    intent: "promise_to_pay",
    weight: 2,
    terms: ["will pay", "pay on", "payday", "next week", "end of month", "friday", "monday", "tomorrow", "salaris", "ngizokhokha", "by the 25th", "once i get paid"],
  },
  {
    intent: "wrong_contact",
    weight: 2,
    terms: ["wrong number", "not me", "no longer with", "left the company", "verkeerde nommer", "akumina"],
  },
  {
    intent: "complaint",
    weight: 2,
    terms: ["harassment", "ombud", "lawyer", "attorney", "report you", "popia", "complaint", "kla"],
  },
  {
    intent: "question",
    weight: 1,
    terms: ["what is", "which invoice", "can you send", "how much", "statement", "breakdown", "?"],
  },
];

const NEGATIVE = ["angry", "ridiculous", "harassment", "stop calling", "fed up", "unacceptable", "useless"];
const POSITIVE = ["thanks", "thank you", "sure", "no problem", "will do", "great", "dankie", "ngiyabonga"];

function extractAmountCents(text: string): number | null {
  const m = text.match(/r\s?([0-9][0-9\s,]*(?:\.[0-9]{1,2})?)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s,]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function extractInstalments(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*(?:x|×|instal?l?ments?|payments|months|parts)/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 2 && n <= 12) return n;
  }
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  const w = text.toLowerCase().match(/\b(two|three|four|five|six)\b\s*(?:instal?l?ments?|payments|months)/);
  if (w) return words[w[1]] ?? null;
  return null;
}

function extractDateHint(text: string): string | null {
  const patterns = [
    /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/i,
    /\b(end of (?:the )?month|month[- ]end|payday|next week|this week|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday)\b/i,
    /\b(?:on|by) the (\d{1,2})(?:st|nd|rd|th)?\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Lightweight, auditable intent classifier for inbound replies (EN/AF/ZU aware). */
export function classifyInbound(raw: string): Classification {
  const text = ` ${raw.toLowerCase()} `;
  const scores = new Map<Intent, number>();
  const matched: string[] = [];

  for (const rule of RULES) {
    for (const term of rule.terms) {
      if (text.includes(term)) {
        scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + rule.weight);
        matched.push(term);
      }
    }
  }

  // "Stop" only counts as opt-out when it is the message, not part of a sentence.
  if (scores.has("opt_out") && raw.trim().length > 40 && !/\b(unsubscribe|do not contact|opt out|remove me)\b/i.test(raw)) {
    scores.set("opt_out", (scores.get("opt_out") ?? 0) - 3);
  }

  let intent: Intent = "other";
  let best = 0;
  for (const [key, value] of scores) {
    if (value > best) {
      best = value;
      intent = key;
    }
  }

  const sentiment: Classification["sentiment"] = NEGATIVE.some((w) => text.includes(w))
    ? "negative"
    : POSITIVE.some((w) => text.includes(w))
      ? "positive"
      : "neutral";

  const routeToHuman = ["dispute", "complaint", "hardship", "wrong_contact"].includes(intent) || sentiment === "negative";

  const suggestedAction: Record<Intent, string> = {
    payment_made: "Verify against bank feed, then close the case and thank the customer",
    promise_to_pay: "Log promise-to-pay, schedule a confirmation the morning after the promised date",
    negotiate: "Generate a policy-compliant arrangement offer",
    dispute: "Freeze automated outreach and route to a billing specialist within 1 business day",
    hardship: "Pause escalation, offer extended arrangement, flag for empathetic human contact",
    question: "Send requested statement / breakdown, keep cadence running",
    opt_out: "Revoke channel consent immediately and suppress outreach",
    wrong_contact: "Suppress this contact and request updated details from the account owner",
    complaint: "Escalate to a manager, stop all automation on the account",
    other: "Route to human for a read",
  };

  return {
    intent,
    confidence: Math.min(0.97, 0.42 + best * 0.13),
    sentiment,
    amountCents: extractAmountCents(raw),
    instalments: extractInstalments(raw),
    dateHint: extractDateHint(raw),
    routeToHuman,
    suggestedAction: suggestedAction[intent],
    matched: Array.from(new Set(matched)).slice(0, 6),
  };
}

export const INTENT_META: Record<Intent, { label: string; className: string }> = {
  payment_made: { label: "Payment claimed", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  promise_to_pay: { label: "Promise to pay", className: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  negotiate: { label: "Wants arrangement", className: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  dispute: { label: "Dispute", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  hardship: { label: "Hardship", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  question: { label: "Question", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  opt_out: { label: "Opt-out", className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  wrong_contact: { label: "Wrong contact", className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  complaint: { label: "Complaint", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  other: { label: "Unclassified", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};
