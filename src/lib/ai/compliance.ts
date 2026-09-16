import { SA_TIMEZONE } from "@/lib/format";

export type PolicyLike = {
  quietHoursStart: number;
  quietHoursEnd: number;
  contactSundays: boolean;
  maxContactsPerWeek: number;
  minHoursBetweenContacts: number;
  allowWhatsapp: boolean;
  allowSms: boolean;
  allowEmail: boolean;
  allowVoice: boolean;
  voiceMinBalanceCents: number;
  escalateAboveCents: number;
  escalateAfterDays: number;
  autoNegotiate: boolean;
  maxInstalments: number;
  minDepositPct: number;
  legalActionRequiresHuman: boolean;
};

export type ConsentLike = { channel: string; status: string };

export const CHANNELS = ["whatsapp", "sms", "email", "voice"] as const;
export type Channel = (typeof CHANNELS)[number];

export function saParts(now = new Date()): { hour: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: SA_TIMEZONE,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const weekdayName = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, weekday: map[weekdayName] ?? 1 };
}

export function isQuietHours(policy: PolicyLike, now = new Date()): boolean {
  const { hour, weekday } = saParts(now);
  if (!policy.contactSundays && weekday === 0) return true;
  const { quietHoursStart: start, quietHoursEnd: end } = policy;
  if (start === end) return false;
  // Window wraps midnight (e.g. 20:00 -> 08:00).
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

export function nextAllowedWindow(policy: PolicyLike, now = new Date()): Date {
  const next = new Date(now);
  for (let i = 0; i < 96; i += 1) {
    next.setTime(next.getTime() + 60 * 60 * 1000);
    if (!isQuietHours(policy, next)) return next;
  }
  return next;
}

export function channelAllowedByPolicy(policy: PolicyLike, channel: string): boolean {
  if (channel === "whatsapp") return policy.allowWhatsapp;
  if (channel === "sms") return policy.allowSms;
  if (channel === "email") return policy.allowEmail;
  if (channel === "voice") return policy.allowVoice;
  return false;
}

export function consentFor(consents: ConsentLike[], channel: string): string {
  return consents.find((c) => c.channel === channel)?.status ?? "denied";
}

export type ChannelDecision = {
  channel: Channel | null;
  reasons: string[];
  blocked: { channel: string; reason: string }[];
  considered: { channel: Channel; score: number }[];
};

/**
 * Picks the cheapest effective channel the customer has consented to, subject
 * to org policy. Voice is reserved for high-value / late-stage accounts.
 */
export function selectChannel(args: {
  policy: PolicyLike;
  consents: ConsentLike[];
  preferredChannel: string;
  balanceCents: number;
  daysOverdue: number;
  strategy: string;
  repliesByChannel: Record<string, number>;
  failuresByChannel?: Record<string, number>;
}): ChannelDecision {
  const { policy, consents, preferredChannel, balanceCents, daysOverdue, strategy } = args;
  const blocked: { channel: string; reason: string }[] = [];
  const considered: { channel: Channel; score: number }[] = [];

  for (const channel of CHANNELS) {
    const consent = consentFor(consents, channel);
    if (consent !== "granted") {
      blocked.push({ channel, reason: consent === "revoked" ? "Consent revoked by customer" : "No consent on file" });
      continue;
    }
    if (!channelAllowedByPolicy(policy, channel)) {
      blocked.push({ channel, reason: "Disabled in org communication policy" });
      continue;
    }
    if (channel === "voice" && balanceCents < policy.voiceMinBalanceCents) {
      blocked.push({ channel, reason: `Voice reserved for balances over R${policy.voiceMinBalanceCents / 100}` });
      continue;
    }
    if (channel === "voice" && daysOverdue < 30 && strategy !== "high_value_human") {
      blocked.push({ channel, reason: "Voice only after 30 days overdue" });
      continue;
    }

    let score = { whatsapp: 70, sms: 52, email: 48, voice: 30 }[channel];
    if (channel === preferredChannel) score += 14;
    score += Math.min(20, (args.repliesByChannel[channel] ?? 0) * 8);
    score -= Math.min(25, (args.failuresByChannel?.[channel] ?? 0) * 12);
    if (channel === "email" && balanceCents > 1_000_000) score += 8; // paper trail for big balances
    if (channel === "sms" && daysOverdue > 45) score += 6;
    if (channel === "voice" && (strategy === "high_value_human" || daysOverdue > 75)) score += 34;
    if (channel === "whatsapp" && balanceCents <= 50_000) score += 8; // low-friction PayShap band
    considered.push({ channel, score });
  }

  considered.sort((a, b) => b.score - a.score);
  const winner = considered[0]?.channel ?? null;
  const reasons: string[] = [];
  if (winner) {
    reasons.push(`${winner} selected (score ${considered[0].score})`);
    if (winner === preferredChannel) reasons.push("Matches customer's stated channel preference");
    if (blocked.length) reasons.push(`${blocked.length} channel(s) unavailable`);
  } else {
    reasons.push("No consented + policy-approved channel available");
  }
  return { channel: winner, reasons, blocked, considered };
}

export type OutreachGate = {
  allowed: boolean;
  holdReason?: string;
  notes: string[];
  retryAt?: Date;
};

export function gateOutreach(args: {
  policy: PolicyLike;
  contactsThisWeek: number;
  lastContactAt: Date | null;
  status: string;
  now?: Date;
}): OutreachGate {
  const now = args.now ?? new Date();
  const notes: string[] = [];

  if (args.status === "paused") {
    return { allowed: false, holdReason: "Customer opted out — all outreach suppressed", notes };
  }
  if (args.status === "disputed") {
    return { allowed: false, holdReason: "Dispute open — automated collections paused pending staff review", notes };
  }
  if (args.status === "recovered" || args.status === "closed") {
    return { allowed: false, holdReason: "Case closed", notes };
  }
  if (isQuietHours(args.policy, now)) {
    return {
      allowed: false,
      holdReason: `Quiet hours (${args.policy.quietHoursStart}:00–${args.policy.quietHoursEnd}:00 SAST)`,
      notes,
      retryAt: nextAllowedWindow(args.policy, now),
    };
  }
  if (args.contactsThisWeek >= args.policy.maxContactsPerWeek) {
    return {
      allowed: false,
      holdReason: `Weekly contact cap reached (${args.policy.maxContactsPerWeek})`,
      notes,
      retryAt: new Date(now.getTime() + 3 * 86_400_000),
    };
  }
  if (args.lastContactAt) {
    const hours = (now.getTime() - new Date(args.lastContactAt).getTime()) / 3_600_000;
    if (hours < args.policy.minHoursBetweenContacts) {
      return {
        allowed: false,
        holdReason: `Cooling-off window (${args.policy.minHoursBetweenContacts}h between contacts)`,
        notes,
        retryAt: new Date(new Date(args.lastContactAt).getTime() + args.policy.minHoursBetweenContacts * 3_600_000),
      };
    }
    notes.push(`${Math.round(hours)}h since last contact — cooling-off satisfied`);
  }
  notes.push("Consent, quiet hours and frequency checks passed");
  return { allowed: true, notes };
}

/** Anything that must never be automated without a human in the loop. */
export function requiresHuman(args: {
  policy: PolicyLike;
  balanceCents: number;
  daysOverdue: number;
  strategy: string;
  status: string;
}): string | null {
  if (args.status === "disputed") return "Dispute requires a human owner";
  if (args.strategy === "pre_legal_review" && args.policy.legalActionRequiresHuman) {
    return "Pre-legal step — legal action requires human sign-off";
  }
  if (args.balanceCents >= args.policy.escalateAboveCents && args.daysOverdue >= args.policy.escalateAfterDays) {
    return `Balance over R${Math.round(args.policy.escalateAboveCents / 100)} and ${args.daysOverdue} days overdue`;
  }
  return null;
}
