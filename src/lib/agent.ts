import { randomBytes } from "node:crypto";

import { and, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";

import { db, pool } from "@/db";
import {
  activities,
  arrangements,
  consents,
  customers,
  invoices,
  messages,
  organizations,
  paymentRequests,
  payments,
  playbooks,
  policies,
  recoveryCases,
} from "@/db/schema";
import { composeMessage } from "@/lib/ai/composer";
import { gateOutreach, requiresHuman, selectChannel, type PolicyLike } from "@/lib/ai/compliance";
import { classifyInbound, type Classification } from "@/lib/ai/inbound";
import { proposeArrangement } from "@/lib/ai/negotiator";
import { scoreAccount, STRATEGY_LABEL } from "@/lib/ai/scoring";
import { requireOrgId } from "@/lib/auth";
import { env } from "@/lib/env";
import { daysOverdue, zar } from "@/lib/format";
import { ensureSeeded } from "@/lib/seed";

export type OrgContext = {
  org: typeof organizations.$inferSelect;
  policy: typeof policies.$inferSelect;
};

export async function getContext(): Promise<OrgContext> {
  await ensureSeeded();

  let orgId: number;
  try {
    orgId = await requireOrgId();
  } catch {
    // TODO(Better Auth): fallback to first org until session/org scoping lands.
    // requireOrgId() already falls back to the first org, but we keep this
    // guard so getContext() never hard-crashes if auth is misconfigured
    // or the DB is empty during early boot. Remove once Better Auth is wired
    // and every request carries a session with an orgId.
    const [fallback] = await db.select().from(organizations).orderBy(organizations.id).limit(1);
    if (!fallback) throw new Error("No organization is configured");
    orgId = fallback.id;
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw new Error("No organization is configured");
  const [policy] = await db.select().from(policies).where(eq(policies.orgId, org.id)).limit(1);
  if (!policy) throw new Error(`No communication policy is configured for organization ${org.id}`);
  return { org, policy };
}

const CADENCE_DAYS: Record<string, number> = {
  gentle_nudge: 3,
  payment_request: 3,
  arrangement_offer: 4,
  subscription_dunning: 2,
  checkout_recovery: 1,
  reactivation: 7,
  quote_followup: 4,
  high_value_human: 2,
  pre_legal_review: 5,
  dispute_resolution: 2,
  arrangement_followup: 7,
};

const NEEDS_PAY_LINK = new Set([
  "gentle_nudge",
  "payment_request",
  "arrangement_offer",
  "subscription_dunning",
  "checkout_recovery",
  "high_value_human",
  "arrangement_followup",
]);

function token() {
  // 12 bytes => 16 base64url chars, ~96 bits of entropy; upper-cased for
  // human-friendly reference suffixes while remaining URL-safe.
  // TODO(Payments): if PayShap provider mints its own token, prefer that and
  // keep this only as the local reference suffix.
  return randomBytes(12).toString("base64url").toUpperCase();
}

function payLinkForToken(t: string): string {
  // PAY_BASE_URL is normalised to a trailing slash by src/lib/env.ts (fallback https://pay.recoup.africa/r/)
  // TODO(Payments): delegate to PayShapProvider.createRequest() when live provider lands.
  const base = env.PAY_BASE_URL;
  return `${base}${t}`;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const value = key(item);
    const bucket = grouped.get(value);
    if (bucket) bucket.push(item);
    else grouped.set(value, [item]);
  }
  return grouped;
}

async function log(
  orgId: number,
  caseId: number | null,
  type: string,
  title: string,
  detail?: string,
  actor = "ai",
  amountCents?: number,
) {
  await db.insert(activities).values({ orgId, caseId, type, title, detail, actor, amountCents });
}

export type CycleResult = {
  evaluated: number;
  sent: number;
  held: number;
  escalated: number;
  suppressed: number;
  paymentRequests: number;
  valueTargetedCents: number;
  busy?: boolean;
  log: { caseId: number; customer: string; outcome: string; detail: string }[];
};

const AGENT_LOCK_ID = 714_202_601;

/** Only one worker may own the collection queue at a time. */
export async function runAgentCycle(
  opts: { limit?: number; force?: boolean; override?: boolean } = {},
): Promise<CycleResult> {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [AGENT_LOCK_ID]);
    if (!lock.rows[0]?.locked) {
      return {
        evaluated: 0,
        sent: 0,
        held: 0,
        escalated: 0,
        suppressed: 0,
        paymentRequests: 0,
        valueTargetedCents: 0,
        busy: true,
        log: [{ caseId: 0, customer: "Recovery queue", outcome: "Busy", detail: "Another agent cycle already owns the queue" }],
      };
    }
    return await executeAgentCycle(opts);
  } finally {
    await client.query("select pg_advisory_unlock($1)", [AGENT_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

/**
 * The autonomous run: score → segment → compliance gate → channel → message.
 * Only ever *communicates*; it never makes credit decisions or legal threats.
 */
async function executeAgentCycle(
  opts: { limit?: number; force?: boolean; override?: boolean } = {},
): Promise<CycleResult> {
  const limit = opts.limit ?? 12;
  const now = new Date();
  const { org, policy } = await getContext();

  // A supervised override lets a staff member run the book outside the sending
  // window. Consent, opt-outs, frequency caps and escalation rules all still
  // apply, and the override itself is written to the audit trail.
  const effectivePolicy: PolicyLike = opts.override
    ? { ...policy, quietHoursStart: 0, quietHoursEnd: 0, contactSundays: true }
    : (policy as PolicyLike);
  if (opts.override) {
    await log(
      org.id,
      null,
      "policy",
      "Supervised quiet-hours override",
      "A staff member authorised this run outside the configured sending window. Consent, caps and escalation rules still enforced.",
      "staff",
    );
  }

  const due = await db
    .select({
      c: recoveryCases,
      inv: invoices,
      cust: customers,
    })
    .from(recoveryCases)
    .innerJoin(invoices, eq(invoices.id, recoveryCases.invoiceId))
    .innerJoin(customers, eq(customers.id, recoveryCases.customerId))
    .where(
      and(
        eq(recoveryCases.orgId, org.id),
        notInArray(recoveryCases.status, ["recovered", "closed", "paused"]),
        opts.force ? undefined : or(isNull(recoveryCases.nextActionAt), lte(recoveryCases.nextActionAt, now)),
      ),
    )
    .orderBy(desc(recoveryCases.priority), recoveryCases.nextActionAt)
    .limit(limit);

  const result: CycleResult = {
    evaluated: 0,
    sent: 0,
    held: 0,
    escalated: 0,
    suppressed: 0,
    paymentRequests: 0,
    valueTargetedCents: 0,
    log: [],
  };
  if (due.length === 0) return result;

  const caseIds = due.map((r) => r.c.id);
  const customerIds = Array.from(new Set(due.map((r) => r.c.customerId)));
  const invoiceIds = due.map((r) => r.inv.id);

  const [allMessages, allConsents, allArrangements, allPayments, pendingRequests, orgPlaybooks] = await Promise.all([
    db.select().from(messages).where(inArray(messages.caseId, caseIds)),
    db.select().from(consents).where(inArray(consents.customerId, customerIds)),
    db.select().from(arrangements).where(inArray(arrangements.caseId, caseIds)),
    db.select().from(payments).where(inArray(payments.invoiceId, invoiceIds)),
    db
      .select()
      .from(paymentRequests)
      .where(and(inArray(paymentRequests.caseId, caseIds), eq(paymentRequests.status, "pending"))),
    db.select({ key: playbooks.key, active: playbooks.active }).from(playbooks).where(eq(playbooks.orgId, org.id)),
  ]);

  const messagesByCase = groupBy(allMessages, (item) => item.caseId);
  const consentsByCustomer = groupBy(allConsents, (item) => item.customerId);
  const arrangementsByCase = groupBy(allArrangements, (item) => item.caseId);
  const paymentsByInvoice = groupBy(allPayments, (item) => item.invoiceId);
  const requestsByCase = groupBy(pendingRequests, (item) => item.caseId);
  const activePlaybooks = new Set(orgPlaybooks.filter((item) => item.active).map((item) => item.key));

  for (const row of due) {
    result.evaluated += 1;
    const { c, inv, cust } = row;
    const caseMessages = messagesByCase.get(c.id) ?? [];
    const custConsents = consentsByCustomer.get(c.customerId) ?? [];
    const grantedConsents = custConsents.filter((item) => item.status === "granted");
    const inbound = caseMessages.filter((item) => item.direction === "inbound");
    const outbound = caseMessages.filter((item) => item.direction === "outbound");
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const contactsThisWeek = outbound.filter((item) => new Date(item.createdAt) >= weekAgo).length;
    const age = daysOverdue(new Date(inv.dueAt), now);
    const activeArrangement = (arrangementsByCase.get(c.id) ?? []).find((item) => ["proposed", "active"].includes(item.status));
    const partial = (paymentsByInvoice.get(inv.id)?.length ?? 0) > 0 && inv.balanceCents > 0;

    const score = scoreAccount(
      {
        amountCents: inv.amountCents,
        balanceCents: inv.balanceCents,
        dueAt: new Date(inv.dueAt),
        category: inv.category,
        customerType: cust.customerType,
        relationshipMonths: cust.relationshipMonths,
        onTimePayments: cust.onTimePayments,
        latePayments: cust.latePayments,
        brokenPromises: cust.brokenPromises,
        lifetimeValueCents: cust.lifetimeValueCents,
        inboundReplies: inbound.length,
        outboundTouches: outbound.length,
        hasDispute: c.status === "disputed" || inv.status === "disputed",
        hasActiveArrangement: Boolean(activeArrangement),
        hasPartialPayment: partial,
        consentedChannels: grantedConsents.length,
      },
      now,
    );

    // An active arrangement changes the job: chase the instalment, not the balance.
    const strategy = activeArrangement && ["arrangement", "promise_to_pay"].includes(c.status)
      ? "arrangement_followup"
      : score.strategy;

    result.valueTargetedCents += inv.balanceCents;

    const configuredPlaybookKey = strategy === "arrangement_followup" ? "arrangement_offer" : strategy;
    const base = {
      propensity: score.propensity,
      priority: score.priority,
      riskTier: score.riskTier,
      segment: score.segment,
      playbookKey: strategy,
      aiRationale: score.rationale,
      contactsThisWeek,
      updatedAt: now,
    };

    if (!activePlaybooks.has(configuredPlaybookKey)) {
      const holdReason = `Playbook disabled: ${STRATEGY_LABEL[strategy] ?? strategy}`;
      await db
        .update(recoveryCases)
        .set({
          ...base,
          holdReason,
          nextAction: "Waiting for a staff member to enable or reassign the playbook",
          nextActionAt: new Date(now.getTime() + 7 * 86_400_000),
          aiSummary: `${holdReason}. No communication was sent.`,
        })
        .where(eq(recoveryCases.id, c.id));
      await log(org.id, c.id, "system", `Playbook hold — ${cust.name}`, holdReason, "ai");
      result.held += 1;
      result.log.push({ caseId: c.id, customer: cust.name, outcome: "Held", detail: holdReason });
      continue;
    }

    // 1) Human-in-the-loop guardrails.
    const humanReason = requiresHuman({
      policy: effectivePolicy,
      balanceCents: inv.balanceCents,
      daysOverdue: age,
      strategy,
      status: c.status,
    });
    if (humanReason) {
      await db
        .update(recoveryCases)
        .set({
          ...base,
          status: "escalated",
          assignedTo: c.assignedTo ?? "Thandi M. (Collections lead)",
          holdReason: humanReason,
          nextAction: "Human review required before further contact",
          nextActionAt: new Date(now.getTime() + 86_400_000),
          aiSummary: `${STRATEGY_LABEL[strategy]} — held for human sign-off. ${humanReason}.`,
        })
        .where(eq(recoveryCases.id, c.id));
      await log(org.id, c.id, "escalation", `Escalated to human: ${cust.name}`, humanReason, "ai", inv.balanceCents);
      result.escalated += 1;
      result.log.push({ caseId: c.id, customer: cust.name, outcome: "Escalated", detail: humanReason });
      continue;
    }

    // 2) Consent / quiet hours / frequency gate.
    const gate = gateOutreach({
      policy: effectivePolicy,
      contactsThisWeek,
      lastContactAt: c.lastContactAt ? new Date(c.lastContactAt) : null,
      status: c.status,
      now,
    });
    if (!gate.allowed) {
      await db
        .update(recoveryCases)
        .set({
          ...base,
          holdReason: gate.holdReason,
          nextAction: `Waiting: ${gate.holdReason}`,
          nextActionAt: gate.retryAt ?? new Date(now.getTime() + 86_400_000),
          aiSummary: `Outreach held. ${gate.holdReason}.`,
        })
        .where(eq(recoveryCases.id, c.id));
      await log(org.id, c.id, "system", `Outreach held for ${cust.name}`, gate.holdReason, "ai");
      result.held += 1;
      result.log.push({ caseId: c.id, customer: cust.name, outcome: "Held", detail: gate.holdReason ?? "" });
      continue;
    }

    // 3) Channel selection.
    const repliesByChannel: Record<string, number> = {};
    for (const m of inbound) repliesByChannel[m.channel] = (repliesByChannel[m.channel] ?? 0) + 1;
    const failuresByChannel: Record<string, number> = {};
    for (const m of outbound.filter((x) => x.status === "failed")) {
      failuresByChannel[m.channel] = (failuresByChannel[m.channel] ?? 0) + 1;
    }

    const decision = selectChannel({
      policy: effectivePolicy,
      consents: custConsents,
      preferredChannel: cust.preferredChannel,
      balanceCents: inv.balanceCents,
      daysOverdue: age,
      strategy,
      repliesByChannel,
      failuresByChannel,
    });

    if (!decision.channel) {
      await db
        .update(recoveryCases)
        .set({
          ...base,
          status: "paused",
          holdReason: "No consented channel available",
          nextAction: "Request fresh consent via account manager",
          nextActionAt: null,
          aiSummary: "All channels blocked by consent or policy — suppressed.",
        })
        .where(eq(recoveryCases.id, c.id));
      await log(org.id, c.id, "consent", `Suppressed ${cust.name}`, decision.blocked.map((b) => `${b.channel}: ${b.reason}`).join("; "), "ai");
      result.suppressed += 1;
      result.log.push({ caseId: c.id, customer: cust.name, outcome: "Suppressed", detail: "No consented channel" });
      continue;
    }

    // 4) Payment instrument.
    let payLink: string | null = null;
    let payReference: string | null = null;
    if (NEEDS_PAY_LINK.has(strategy)) {
      const existingRequest = (requestsByCase.get(c.id) ?? []).find(
        (item) => !item.expiresAt || new Date(item.expiresAt) > now,
      );
      if (existingRequest) {
        payReference = existingRequest.reference;
        payLink = payLinkForToken(existingRequest.token);
      } else {
        const secureToken = token();
        payReference = `${inv.number}-${secureToken.slice(0, 4)}`;
        payLink = payLinkForToken(secureToken);
        await db.insert(paymentRequests).values({
          caseId: c.id,
          invoiceId: inv.id,
          amountCents: inv.balanceCents,
          method: inv.balanceCents <= 1_500_000 ? "payshap" : "card_link",
          reference: payReference,
          token: secureToken,
          status: "pending",
          expiresAt: new Date(now.getTime() + 7 * 86_400_000),
        });
        result.paymentRequests += 1;
      }
    }

    // 5) Arrangement maths (only when the strategy calls for it).
    const arrangementOffer =
      strategy === "arrangement_offer" && !activeArrangement
        ? proposeArrangement({
            policy: effectivePolicy,
            balanceCents: inv.balanceCents,
            propensity: score.propensity,
            daysOverdue: age,
            now,
          })
        : null;

    // 6) Compose + "send".
    const composed = composeMessage({
      orgName: org.name,
      contactName: cust.contactName,
      customerName: cust.name,
      invoiceNumber: inv.number,
      category: inv.category,
      balanceCents: inv.balanceCents,
      daysOverdue: age,
      channel: decision.channel,
      strategy,
      goal: STRATEGY_LABEL[strategy] ?? "Recover balance",
      tone: policy.tone,
      language: cust.language,
      signature: policy.signature,
      payLink,
      payReference,
      arrangement: activeArrangement
        ? {
            instalments: activeArrangement.instalments,
            instalmentCents: activeArrangement.instalmentCents,
            depositCents: 0,
            cadence: activeArrangement.cadence,
          }
        : arrangementOffer && arrangementOffer.approved
          ? {
              instalments: arrangementOffer.instalments,
              instalmentCents: arrangementOffer.instalmentCents,
              depositCents: arrangementOffer.depositCents,
              cadence: arrangementOffer.cadence,
            }
          : null,
      failureReason: inv.failureReason,
    });

    await db.insert(messages).values({
      caseId: c.id,
      customerId: c.customerId,
      direction: "outbound",
      channel: decision.channel,
      subject: composed.subject,
      body: composed.body,
      status: "delivered",
      tone: composed.tone,
      generatedBy: "ai",
      costCents: decision.channel === "voice" ? 120 : decision.channel === "sms" ? 25 : decision.channel === "whatsapp" ? 12 : 2,
    });

    if (arrangementOffer && arrangementOffer.approved) {
      await db.insert(arrangements).values({
        caseId: c.id,
        invoiceId: inv.id,
        totalCents: arrangementOffer.totalCents,
        depositCents: arrangementOffer.depositCents,
        instalments: arrangementOffer.instalments,
        instalmentCents: arrangementOffer.instalmentCents,
        cadence: arrangementOffer.cadence,
        firstDueAt: arrangementOffer.firstDueAt,
        status: "proposed",
        approvedBy: "ai",
      });
    }

    const cadenceDays = CADENCE_DAYS[strategy] ?? 4;
    await db
      .update(recoveryCases)
      .set({
        ...base,
        status: c.status === "queued" ? "engaging" : c.status,
        assignedTo: strategy === "high_value_human" ? (c.assignedTo ?? "Thandi M. (Collections lead)") : c.assignedTo,
        stepIndex: c.stepIndex + 1,
        holdReason: null,
        lastContactAt: now,
        contactsThisWeek: contactsThisWeek + 1,
        nextChannel: decision.channel,
        nextAction: `${STRATEGY_LABEL[strategy]} follow-up in ${cadenceDays} days`,
        nextActionAt: new Date(now.getTime() + cadenceDays * 86_400_000),
        aiSummary: `${score.segment}. ${STRATEGY_LABEL[strategy]} sent via ${decision.channel}. Propensity ${score.propensity}/100, expected recovery ${zar(score.expectedRecoveryCents)}.`,
      })
      .where(eq(recoveryCases.id, c.id));

    await db
      .update(playbooks)
      .set({ touches: sql`${playbooks.touches} + 1` })
      .where(and(eq(playbooks.orgId, org.id), eq(playbooks.key, configuredPlaybookKey)));

    await log(
      org.id,
      c.id,
      "message",
      `${decision.channel} sent to ${cust.contactName}`,
      `${STRATEGY_LABEL[strategy]} · propensity ${score.propensity}/100 · ${decision.reasons[0]}`,
      "ai",
      inv.balanceCents,
    );

    result.sent += 1;
    result.log.push({
      caseId: c.id,
      customer: cust.name,
      outcome: `Sent ${decision.channel}`,
      detail: `${STRATEGY_LABEL[strategy]} · ${zar(inv.balanceCents)}`,
    });
  }

  await log(
    org.id,
    null,
    "system",
    "AI recovery cycle completed",
    `${result.evaluated} accounts evaluated · ${result.sent} contacted · ${result.escalated} escalated · ${result.held} held by policy`,
    "system",
  );

  return result;
}

/* ------------------------------------------------------------------ */
/* Inbound handling                                                     */
/* ------------------------------------------------------------------ */

export type InboundResult = {
  classification: Classification;
  action: string;
  autoReply: string | null;
  duplicate?: boolean;
};

export async function handleInbound(args: {
  caseId: number;
  body: string;
  channel?: string;
  externalId?: string;
  now?: Date;
}): Promise<InboundResult> {
  const now = args.now ?? new Date();
  const { org, policy } = await getContext();

  const [row] = await db
    .select({ c: recoveryCases, inv: invoices, cust: customers })
    .from(recoveryCases)
    .innerJoin(invoices, eq(invoices.id, recoveryCases.invoiceId))
    .innerJoin(customers, eq(customers.id, recoveryCases.customerId))
    .where(eq(recoveryCases.id, args.caseId))
    .limit(1);
  if (!row) throw new Error("Case not found");

  const channel = args.channel ?? row.c.nextChannel ?? row.cust.preferredChannel;
  const classification = classifyInbound(args.body);
  const age = daysOverdue(new Date(row.inv.dueAt), now);

  const inserted = await db
    .insert(messages)
    .values({
      caseId: row.c.id,
      customerId: row.c.customerId,
      externalId: args.externalId ?? null,
      direction: "inbound",
      channel,
      body: args.body,
      status: "delivered",
      intent: classification.intent,
      sentiment: classification.sentiment,
      generatedBy: "customer",
    })
    .onConflictDoNothing({ target: messages.externalId })
    .returning({ id: messages.id });

  if (args.externalId && inserted.length === 0) {
    return {
      classification,
      action: "Duplicate provider event ignored — no workflow ran twice",
      autoReply: null,
      duplicate: true,
    };
  }

  let action = classification.suggestedAction;
  let autoReply: string | null = null;

  switch (classification.intent) {
    case "opt_out": {
      await db
        .update(consents)
        .set({ status: "revoked", revokedAt: now, note: "Customer replied STOP" })
        .where(eq(consents.customerId, row.c.customerId));
      await db
        .update(recoveryCases)
        .set({
          status: "paused",
          holdReason: "Customer opted out of all channels",
          nextAction: "Suppressed — statement by post only, or contact through account manager",
          nextActionAt: null,
          aiSummary: "Customer opted out. All automated outreach suppressed across every channel.",
          updatedAt: now,
        })
        .where(eq(recoveryCases.id, row.c.id));
      autoReply = "You have been unsubscribed. You will not receive further payment reminders from us on this number.";
      action = "All channel consent revoked; outreach suppressed immediately";
      await log(org.id, row.c.id, "consent", `Opt-out honoured — ${row.cust.name}`, "Consent revoked on every channel", "system");
      break;
    }
    case "dispute": {
      await db
        .update(recoveryCases)
        .set({
          status: "disputed",
          assignedTo: "Sipho D. (Billing specialist)",
          holdReason: "Dispute raised by customer",
          nextAction: "Billing specialist to investigate and respond within 1 business day",
          nextActionAt: new Date(now.getTime() + 86_400_000),
          aiSummary: `Dispute detected: "${args.body.slice(0, 120)}". Automated collections frozen.`,
          updatedAt: now,
        })
        .where(eq(recoveryCases.id, row.c.id));
      await db.update(invoices).set({ status: "disputed" }).where(eq(invoices.id, row.inv.id));
      autoReply =
        "Thank you for flagging this — I have placed the account on hold and a billing specialist will review it and come back to you within one business day. No further reminders will go out in the meantime.";
      action = "Case frozen and routed to a billing specialist";
      await log(org.id, row.c.id, "dispute", `Dispute detected — ${row.cust.name}`, args.body.slice(0, 180), "ai", row.inv.balanceCents);
      break;
    }
    case "negotiate":
    case "hardship": {
      const proposal = proposeArrangement({
        policy: policy as PolicyLike,
        balanceCents: row.inv.balanceCents,
        propensity: row.c.propensity,
        requestedInstalments: classification.instalments ?? (classification.intent === "hardship" ? policy.maxInstalments : null),
        requestedFirstPaymentCents: classification.amountCents,
        daysOverdue: age,
        now,
      });
      await db.insert(arrangements).values({
        caseId: row.c.id,
        invoiceId: row.inv.id,
        totalCents: proposal.totalCents,
        depositCents: proposal.depositCents,
        instalments: proposal.instalments,
        instalmentCents: proposal.instalmentCents,
        cadence: proposal.cadence,
        firstDueAt: proposal.firstDueAt,
        status: proposal.approved ? "proposed" : "proposed",
        approvedBy: proposal.approved ? "ai" : "pending-human",
      });
      await db
        .update(recoveryCases)
        .set({
          status: proposal.approved ? "arrangement" : "escalated",
          assignedTo: proposal.approved ? row.c.assignedTo : "Thandi M. (Collections lead)",
          holdReason: proposal.approved ? null : proposal.reason,
          nextAction: proposal.approved
            ? `Confirm first payment of ${zar(proposal.depositCents || proposal.instalmentCents)}`
            : "Human approval needed on requested terms",
          nextActionAt: new Date(now.getTime() + 2 * 86_400_000),
          aiSummary: `${classification.intent === "hardship" ? "Hardship" : "Arrangement request"} — ${proposal.reason}`,
          updatedAt: now,
        })
        .where(eq(recoveryCases.id, row.c.id));
      autoReply = proposal.approved
        ? `Absolutely — we can split ${zar(proposal.totalCents)} into ${proposal.instalments} ${proposal.cadence} payments of ${zar(proposal.instalmentCents)}${proposal.depositCents ? `, with ${zar(proposal.depositCents)} to start` : ""}. No interest or fees. Reply YES and I will send the first payment request.`
        : "Thank you for being upfront. I have sent your proposal to our collections lead for approval and someone will confirm with you shortly. Nothing further will be escalated while we review.";
      action = proposal.approved ? "Policy-compliant arrangement offered automatically" : "Terms outside policy — routed for approval";
      await log(
        org.id,
        row.c.id,
        "arrangement",
        `${proposal.approved ? "Arrangement offered" : "Arrangement needs approval"} — ${row.cust.name}`,
        proposal.reason,
        proposal.approved ? "ai" : "system",
        proposal.totalCents,
      );
      break;
    }
    case "promise_to_pay": {
      const promisedAt = new Date(now.getTime() + (classification.dateHint?.toLowerCase().includes("tomorrow") ? 1 : 6) * 86_400_000);
      await db
        .update(recoveryCases)
        .set({
          status: "promise_to_pay",
          promisedAmountCents: classification.amountCents ?? row.inv.balanceCents,
          promisedAt,
          nextAction: `Confirm payment the morning after ${classification.dateHint ?? "the promised date"}`,
          nextActionAt: new Date(promisedAt.getTime() + 86_400_000),
          holdReason: null,
          aiSummary: `Promise to pay ${zar(classification.amountCents ?? row.inv.balanceCents)}${classification.dateHint ? ` around ${classification.dateHint}` : ""}. Cadence paused until then.`,
          updatedAt: now,
        })
        .where(eq(recoveryCases.id, row.c.id));
      autoReply = `Thank you — I have noted ${zar(classification.amountCents ?? row.inv.balanceCents)}${classification.dateHint ? ` for ${classification.dateHint}` : ""}. I will hold reminders until then and send you a PayShap request on the day so it is one tap.`;
      action = "Promise logged, cadence paused until the promised date";
      await log(org.id, row.c.id, "promise", `Promise to pay — ${row.cust.name}`, classification.dateHint ?? "no date given", "ai", classification.amountCents ?? row.inv.balanceCents);
      break;
    }
    case "payment_made": {
      const [pending] = await db
        .select()
        .from(paymentRequests)
        .where(and(eq(paymentRequests.caseId, row.c.id), eq(paymentRequests.status, "pending")))
        .orderBy(desc(paymentRequests.id))
        .limit(1);
      if (pending) {
        await recordPayment({
          caseId: row.c.id,
          invoiceId: row.inv.id,
          amountCents: classification.amountCents && classification.amountCents <= row.inv.balanceCents ? classification.amountCents : row.inv.balanceCents,
          method: pending.method,
          reference: pending.reference,
          attributedTo: "ai",
          paymentRequestId: pending.id,
          now,
        });
        autoReply = "Received and matched, thank you very much! Your account is up to date — I have emailed the receipt.";
        action = "Payment matched against the open request and the case closed";
      } else {
        await db
          .update(recoveryCases)
          .set({
            status: "engaging",
            assignedTo: "Finance clerk",
            nextAction: "Verify claimed payment against the bank feed",
            nextActionAt: new Date(now.getTime() + 86_400_000),
            aiSummary: "Customer says payment was made but nothing matched on the bank feed yet — held for verification.",
            updatedAt: now,
          })
          .where(eq(recoveryCases.id, row.c.id));
        autoReply = "Thank you — I cannot see it on our side yet. Could you send the proof of payment? I have paused reminders for 48 hours while we check.";
        action = "No matching receipt — reminders paused for manual verification";
      }
      break;
    }
    case "wrong_contact":
    case "complaint": {
      await db
        .update(recoveryCases)
        .set({
          status: "escalated",
          assignedTo: "Thandi M. (Collections lead)",
          holdReason: classification.intent === "complaint" ? "Complaint raised — automation stopped" : "Wrong contact details",
          nextAction: "Human to take over the account",
          nextActionAt: new Date(now.getTime() + 43_200_000),
          aiSummary: `${classification.intent === "complaint" ? "Complaint" : "Wrong contact"} — all automation stopped on this account.`,
          updatedAt: now,
        })
        .where(eq(recoveryCases.id, row.c.id));
      autoReply = "I am sorry about that — I have stopped the automated messages and asked a colleague to contact you personally.";
      action = "Automation stopped, human owner assigned";
      await log(org.id, row.c.id, "escalation", `${classification.intent} — ${row.cust.name}`, args.body.slice(0, 180), "ai");
      break;
    }
    default: {
      await db
        .update(recoveryCases)
        .set({
          status: row.c.status === "queued" ? "engaging" : row.c.status,
          nextAction: "Answer the customer's question, then resume cadence",
          nextActionAt: new Date(now.getTime() + 2 * 86_400_000),
          aiSummary: `Customer asked a question: "${args.body.slice(0, 110)}"`,
          updatedAt: now,
        })
        .where(eq(recoveryCases.id, row.c.id));
      autoReply = `Happy to help. Invoice ${row.inv.number} is for ${row.inv.description} — ${zar(row.inv.balanceCents)} outstanding, due ${new Date(row.inv.dueAt).toLocaleDateString("en-ZA")}. I can resend the statement or a payment link, just say which.`;
      action = "Answered inline and kept the cadence running";
    }
  }

  if (autoReply && classification.intent !== "opt_out") {
    await db.insert(messages).values({
      caseId: row.c.id,
      customerId: row.c.customerId,
      direction: "outbound",
      channel,
      body: autoReply,
      status: "delivered",
      generatedBy: "ai",
      tone: "responsive",
      costCents: channel === "sms" ? 25 : channel === "whatsapp" ? 12 : 2,
    });
    await db
      .update(recoveryCases)
      .set({ lastContactAt: now, contactsThisWeek: sql`${recoveryCases.contactsThisWeek} + 1` })
      .where(eq(recoveryCases.id, row.c.id));
  }

  return { classification, action, autoReply };
}

/* ------------------------------------------------------------------ */
/* Payments                                                             */
/* ------------------------------------------------------------------ */

export async function recordPayment(args: {
  caseId: number | null;
  invoiceId: number;
  amountCents: number;
  method?: string;
  reference?: string;
  attributedTo?: string;
  providerEventId?: string;
  paymentRequestId?: number;
  now?: Date;
}): Promise<{ amount: number; newBalance: number; duplicate: boolean }> {
  await ensureSeeded();
  const now = args.now ?? new Date();

  return db.transaction(async (tx) => {
    // Claim the payment request before touching money. Provider retries can use
    // different event IDs, but they still cannot settle one request twice.
    let requestedAmountCents: number | null = null;
    if (args.paymentRequestId) {
      await tx.execute(sql`select id from payment_requests where id = ${args.paymentRequestId} for update`);
      const [requestRow] = await tx
        .select({ status: paymentRequests.status, amountCents: paymentRequests.amountCents })
        .from(paymentRequests)
        .where(eq(paymentRequests.id, args.paymentRequestId))
        .limit(1);
      if (!requestRow) throw new Error("Payment request not found");
      requestedAmountCents = requestRow.amountCents;
      if (requestRow.status === "paid") {
        const [current] = await tx
          .select({ balanceCents: invoices.balanceCents })
          .from(invoices)
          .where(eq(invoices.id, args.invoiceId))
          .limit(1);
        return { amount: 0, newBalance: current?.balanceCents ?? 0, duplicate: true };
      }
    }

    // Serialize every payment against this invoice. This prevents two provider
    // callbacks from reading the same opening balance and over-crediting it.
    await tx.execute(sql`select id from invoices where id = ${args.invoiceId} for update`);
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, args.invoiceId)).limit(1);
    if (!inv) throw new Error("Invoice not found");

    const amount = Math.max(0, Math.min(Math.round(args.amountCents), inv.balanceCents));
    if (amount === 0) return { amount: 0, newBalance: inv.balanceCents, duplicate: true };

    const inserted = await tx
      .insert(payments)
      .values({
        orgId: inv.orgId,
        caseId: args.caseId,
        invoiceId: args.invoiceId,
        providerEventId: args.providerEventId ?? null,
        amountCents: amount,
        method: args.method ?? "payshap",
        reference: args.reference ?? `PS-${token()}`,
        attributedTo: args.attributedTo ?? "ai",
        paidAt: now,
      })
      .onConflictDoNothing({ target: payments.providerEventId })
      .returning({ id: payments.id });

    if (args.providerEventId && inserted.length === 0) {
      return { amount: 0, newBalance: inv.balanceCents, duplicate: true };
    }

    const newBalance = inv.balanceCents - amount;
    await tx
      .update(invoices)
      .set({ balanceCents: newBalance, status: newBalance === 0 ? "paid" : "partially_paid" })
      .where(eq(invoices.id, args.invoiceId));

    let kase: typeof recoveryCases.$inferSelect | undefined;
    if (args.caseId) {
      [kase] = await tx.select().from(recoveryCases).where(eq(recoveryCases.id, args.caseId)).limit(1);
      await tx
        .update(recoveryCases)
        .set({
          recoveredCents: sql`${recoveryCases.recoveredCents} + ${amount}`,
          status: newBalance === 0 ? "recovered" : "engaging",
          holdReason: null,
          nextAction: newBalance === 0 ? "Closed — send thank-you and retention nudge" : `Collect remaining ${zar(newBalance)}`,
          nextActionAt: newBalance === 0 ? null : new Date(now.getTime() + 3 * 86_400_000),
          closedAt: newBalance === 0 ? now : null,
          aiSummary:
            newBalance === 0
              ? `Recovered ${zar(amount)} in full via ${args.method ?? "payshap"}.`
              : `Part payment of ${zar(amount)} received, ${zar(newBalance)} still outstanding.`,
          updatedAt: now,
        })
        .where(eq(recoveryCases.id, args.caseId));

      if (kase) {
        await tx
          .update(playbooks)
          .set({ recoveredCents: sql`${playbooks.recoveredCents} + ${amount}` })
          .where(and(eq(playbooks.orgId, inv.orgId), eq(playbooks.key, kase.playbookKey)));
      }
    }

    if (args.paymentRequestId && (newBalance === 0 || amount >= (requestedAmountCents ?? Number.MAX_SAFE_INTEGER))) {
      await tx
        .update(paymentRequests)
        .set({ status: "paid", paidAt: now })
        .where(eq(paymentRequests.id, args.paymentRequestId));
    }

    await tx.insert(activities).values({
      orgId: inv.orgId,
      caseId: args.caseId,
      type: "payment",
      title: `Payment received — ${zar(amount)}`,
      detail: `${args.method ?? "payshap"} · invoice ${inv.number}${newBalance === 0 ? " · settled in full" : ` · ${zar(newBalance)} remaining`}`,
      actor: args.attributedTo ?? "ai",
      amountCents: amount,
      createdAt: now,
    });

    return { amount, newBalance, duplicate: false };
  });
}

/* ------------------------------------------------------------------ */
/* Demo simulation                                                      */
/* ------------------------------------------------------------------ */

const REPLY_POOL: { text: string; weight: number }[] = [
  { text: "Hi, sorry for the delay — I'll pay on Friday when my salary comes in.", weight: 3 },
  { text: "Payment made this morning, EFT sent. Proof of payment attached.", weight: 2 },
  { text: "Can I pay this in 3 instalments? Cash flow is very tight this month.", weight: 2 },
  { text: "This invoice is incorrect, we cancelled that order and never received the goods.", weight: 2 },
  { text: "Which invoice is this for? Please send me a statement.", weight: 2 },
  { text: "STOP", weight: 1 },
  { text: "I was retrenched last month and have no income right now. Please help.", weight: 1 },
  { text: "Wrong number, that person left the company.", weight: 1 },
  { text: "I'll settle R1 500 tomorrow and the rest at month-end.", weight: 2 },
  { text: "Dankie, ek sal more betaal.", weight: 1 },
  { text: "Ngizokhokha ngoLwesihlanu, ngiyabonga.", weight: 1 },
];

function pickReply(seed: number) {
  const expanded = REPLY_POOL.flatMap((r) => Array<string>(r.weight).fill(r.text));
  return expanded[seed % expanded.length];
}

/** Demo helper: fabricates realistic inbound traffic so the agent has something to react to. */
export async function simulateInbound(count = 3) {
  const now = new Date();
  const { org } = await getContext();
  const candidates = await db
    .select({ c: recoveryCases })
    .from(recoveryCases)
    .where(
      and(
        eq(recoveryCases.orgId, org.id),
        sql`${recoveryCases.status} in ('engaging','queued','promise_to_pay')`,
        gte(recoveryCases.lastContactAt, new Date(now.getTime() - 30 * 86_400_000)),
      ),
    )
    .orderBy(desc(recoveryCases.lastContactAt))
    .limit(20);

  const results: { caseId: number; intent: string; action: string }[] = [];
  for (let i = 0; i < Math.min(count, candidates.length); i += 1) {
    const target = candidates[i * 2 < candidates.length ? i * 2 : i];
    const reply = pickReply(target.c.id + i * 3 + now.getMinutes());
    const res = await handleInbound({ caseId: target.c.id, body: reply, channel: target.c.nextChannel ?? "whatsapp", now });
    results.push({ caseId: target.c.id, intent: res.classification.intent, action: res.action });
  }
  return results;
}
