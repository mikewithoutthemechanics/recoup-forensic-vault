import type { PolicyLike } from "./compliance";

export type ArrangementProposal = {
  approved: boolean;
  requiresHuman: boolean;
  reason: string;
  totalCents: number;
  depositCents: number;
  instalments: number;
  instalmentCents: number;
  cadence: "weekly" | "biweekly" | "monthly";
  firstDueAt: Date;
};

/**
 * Builds the best arrangement the agent is allowed to offer without human
 * sign-off. Anything outside policy is returned as `requiresHuman`.
 */
export function proposeArrangement(args: {
  policy: PolicyLike;
  balanceCents: number;
  propensity: number;
  requestedInstalments?: number | null;
  requestedFirstPaymentCents?: number | null;
  daysOverdue: number;
  now?: Date;
}): ArrangementProposal {
  const now = args.now ?? new Date();
  const policy = args.policy;

  const wanted =
    args.requestedInstalments && args.requestedInstalments > 0 ? Math.min(Math.round(args.requestedInstalments), 12) : 0;
  const suggested =
    args.balanceCents <= 100_000 ? 2 : args.balanceCents <= 500_000 ? 3 : args.propensity < 40 ? policy.maxInstalments : 3;

  const instalments = Math.max(1, Math.min(policy.maxInstalments, wanted > 0 ? wanted : suggested));
  const overInstalments = wanted > policy.maxInstalments;

  const minDeposit = Math.round((args.balanceCents * policy.minDepositPct) / 100);
  const depositCents = Math.max(minDeposit, args.requestedFirstPaymentCents ?? 0);
  const remainder = Math.max(0, args.balanceCents - depositCents);
  const instalmentCents = instalments > 0 ? Math.ceil(remainder / instalments / 100) * 100 : remainder;

  const cadence: ArrangementProposal["cadence"] = args.balanceCents <= 150_000 ? "weekly" : "monthly";
  const firstDueAt = new Date(now.getTime() + (cadence === "weekly" ? 7 : 14) * 86_400_000);

  const shortDeposit = (args.requestedFirstPaymentCents ?? minDeposit) < minDeposit;
  const requiresHuman =
    !policy.autoNegotiate ||
    overInstalments ||
    shortDeposit ||
    args.balanceCents >= policy.escalateAboveCents;

  const reason = !policy.autoNegotiate
    ? "Auto-negotiation disabled in policy — routed to staff"
    : overInstalments
      ? `Customer asked for ${wanted} instalments; policy allows ${policy.maxInstalments} — needs approval`
      : shortDeposit
        ? `Requested first payment is below the ${policy.minDepositPct}% deposit floor — needs approval`
        : args.balanceCents >= policy.escalateAboveCents
          ? "Balance above the auto-approval ceiling — needs a human signature"
          : `Within policy: ${instalments} × ${cadence} payments with a ${policy.minDepositPct}% deposit`;

  return {
    approved: !requiresHuman,
    requiresHuman,
    reason,
    totalCents: args.balanceCents,
    depositCents,
    instalments,
    instalmentCents,
    cadence,
    firstDueAt,
  };
}
