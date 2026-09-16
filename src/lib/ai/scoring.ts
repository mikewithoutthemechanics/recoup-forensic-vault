import { daysOverdue } from "@/lib/format";

export type ScoreInput = {
  amountCents: number;
  balanceCents: number;
  dueAt: Date;
  category: string;
  customerType: string;
  relationshipMonths: number;
  onTimePayments: number;
  latePayments: number;
  brokenPromises: number;
  lifetimeValueCents: number;
  inboundReplies: number;
  outboundTouches: number;
  hasDispute: boolean;
  hasActiveArrangement: boolean;
  hasPartialPayment: boolean;
  consentedChannels: number;
};

export type ScoreResult = {
  propensity: number;
  priority: number;
  riskTier: "low" | "medium" | "high" | "critical";
  segment: string;
  strategy: string;
  rationale: string[];
  expectedRecoveryCents: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Deterministic, explainable propensity-to-pay model.
 * Every contribution is surfaced in `rationale` so collections staff can audit
 * why the agent treated an account the way it did (no black-box credit calls).
 */
export function scoreAccount(input: ScoreInput, now = new Date()): ScoreResult {
  const age = daysOverdue(input.dueAt, now);
  const rationale: string[] = [];
  let score = 58;

  // 1. Ageing — the strongest single signal.
  if (age <= 0) {
    score += 14;
    rationale.push("Not yet overdue — pre-due nudge window (+14)");
  } else if (age <= 15) {
    score += 8;
    rationale.push(`${age} days overdue: still in the high-cure window (+8)`);
  } else if (age <= 30) {
    score += 1;
    rationale.push(`${age} days overdue: cure rates begin to soften (+1)`);
  } else if (age <= 60) {
    score -= 10;
    rationale.push(`${age} days overdue: material ageing risk (-10)`);
  } else if (age <= 90) {
    score -= 18;
    rationale.push(`${age} days overdue: 60-90 bucket, cure rate drops sharply (-18)`);
  } else {
    score -= 26;
    rationale.push(`${age} days overdue: 90+ bucket, low self-cure probability (-26)`);
  }

  // 2. Payment history.
  const totalPayments = input.onTimePayments + input.latePayments;
  if (totalPayments >= 3) {
    const onTimeRate = input.onTimePayments / totalPayments;
    const delta = Math.round((onTimeRate - 0.6) * 40);
    score += delta;
    rationale.push(
      `${Math.round(onTimeRate * 100)}% on-time history across ${totalPayments} prior payments (${delta >= 0 ? "+" : ""}${delta})`,
    );
  } else {
    score -= 4;
    rationale.push("Thin payment history — limited behavioural signal (-4)");
  }

  // 3. Broken promises.
  if (input.brokenPromises > 0) {
    const delta = Math.min(24, input.brokenPromises * 9);
    score -= delta;
    rationale.push(`${input.brokenPromises} broken payment promise(s) on record (-${delta})`);
  }

  // 4. Engagement.
  if (input.inboundReplies > 0) {
    const delta = Math.min(16, 6 + input.inboundReplies * 4);
    score += delta;
    rationale.push(`Customer replied ${input.inboundReplies}x — engaged conversation (+${delta})`);
  } else if (input.outboundTouches >= 3) {
    score -= 12;
    rationale.push(`${input.outboundTouches} outbound touches with no reply — silent account (-12)`);
  }

  // 5. Relationship depth.
  if (input.relationshipMonths >= 24) {
    score += 7;
    rationale.push(`${input.relationshipMonths}-month relationship — retention value (+7)`);
  } else if (input.relationshipMonths <= 3) {
    score -= 5;
    rationale.push("New customer, unproven behaviour (-5)");
  }

  // 6. Ticket size friction (PayShap-style low-friction band <= R500).
  if (input.balanceCents <= 50_000) {
    score += 10;
    rationale.push("Balance under R500 — one-tap PayShap request converts well (+10)");
  } else if (input.balanceCents > 2_500_000) {
    score -= 9;
    rationale.push("Large balance — usually needs an arrangement or human contact (-9)");
  }

  // 7. Case-state signals.
  if (input.hasPartialPayment) {
    score += 9;
    rationale.push("Partial payment already received — intent demonstrated (+9)");
  }
  if (input.hasActiveArrangement) {
    score += 12;
    rationale.push("Active payment arrangement in place (+12)");
  }
  if (input.hasDispute) {
    score -= 22;
    rationale.push("Open dispute — payment blocked until resolved (-22)");
  }
  if (input.consentedChannels === 0) {
    score -= 20;
    rationale.push("No consented contact channel — outreach suppressed (-20)");
  } else if (input.consentedChannels >= 3) {
    score += 4;
    rationale.push(`${input.consentedChannels} consented channels available (+4)`);
  }

  // 8. Category priors.
  const categoryPrior: Record<string, number> = {
    subscription: 12, // card retries + simple fix
    checkout: 6,
    clinic: 4,
    school_fee: 2,
    invoice: 0,
    quote: -2,
    rental: -6,
    dormant: -12,
  };
  const prior = categoryPrior[input.category] ?? 0;
  if (prior !== 0) {
    score += prior;
    rationale.push(`Category prior for ${input.category.replace("_", " ")} (${prior > 0 ? "+" : ""}${prior})`);
  }

  const propensity = clamp(score);

  // Value-weighted work ranking so staff attention follows recoverable rands.
  const valueWeight = Math.min(100, Math.log10(Math.max(1000, input.balanceCents) / 1000) * 33);
  const urgency = Math.min(100, age * 1.1);
  const priority = clamp(valueWeight * 0.45 + urgency * 0.3 + propensity * 0.25);

  const riskTier: ScoreResult["riskTier"] =
    propensity >= 72 ? "low" : propensity >= 52 ? "medium" : propensity >= 32 ? "high" : "critical";

  const { segment, strategy } = segmentAccount({
    propensity,
    age,
    balanceCents: input.balanceCents,
    hasDispute: input.hasDispute,
    category: input.category,
  });

  return {
    propensity,
    priority,
    riskTier,
    segment,
    strategy,
    rationale,
    expectedRecoveryCents: Math.round((input.balanceCents * propensity) / 100),
  };
}

export function segmentAccount(args: {
  propensity: number;
  age: number;
  balanceCents: number;
  hasDispute: boolean;
  category: string;
}): { segment: string; strategy: string } {
  const { propensity, age, balanceCents, hasDispute, category } = args;
  if (hasDispute) return { segment: "Disputed — human review", strategy: "dispute_resolution" };
  if (category === "subscription") return { segment: "Failed subscription payment", strategy: "subscription_dunning" };
  if (category === "checkout") return { segment: "Abandoned checkout", strategy: "checkout_recovery" };
  if (category === "dormant") return { segment: "Dormant customer", strategy: "reactivation" };
  if (category === "quote") return { segment: "Open quote", strategy: "quote_followup" };

  if (balanceCents >= 2_500_000 && age > 45) {
    return { segment: "High value / aged — owner review", strategy: "high_value_human" };
  }
  if (propensity >= 72 && age <= 21) {
    return { segment: "Likely self-cure — gentle nudge", strategy: "gentle_nudge" };
  }
  if (propensity >= 55) {
    return { segment: "Responsive — payment request", strategy: "payment_request" };
  }
  if (propensity >= 34) {
    return { segment: "Strained — offer arrangement", strategy: "arrangement_offer" };
  }
  return { segment: "Low propensity — pre-legal review", strategy: "pre_legal_review" };
}

export const STRATEGY_LABEL: Record<string, string> = {
  gentle_nudge: "Friendly nudge",
  payment_request: "Direct payment request",
  arrangement_offer: "Offer a payment arrangement",
  arrangement_followup: "Arrangement instalment follow-up",
  subscription_dunning: "Retry card + fix payment method",
  checkout_recovery: "Recover abandoned checkout",
  reactivation: "Reactivate dormant customer",
  quote_followup: "Follow up open quote",
  dispute_resolution: "Resolve dispute (human)",
  high_value_human: "Human-led high value call",
  pre_legal_review: "Pre-legal review (human sign-off)",
};
