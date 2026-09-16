"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { activities, arrangements, consents, customers, invoices, messages, paymentRequests, playbooks, policies, recoveryCases } from "@/db/schema";
import { getContext, handleInbound, recordPayment, runAgentCycle, simulateInbound, type CycleResult } from "@/lib/agent";
import { listCasesPage, type CaseRow } from "@/lib/data";
import { composeMessage } from "@/lib/ai/composer";
import { selectChannel, type PolicyLike } from "@/lib/ai/compliance";
import { refineDraft, llmProvider } from "@/lib/ai/llm";
import { proposeArrangement } from "@/lib/ai/negotiator";
import { scoreAccount, STRATEGY_LABEL } from "@/lib/ai/scoring";
import { resetDatabase } from "@/lib/seed";
import { daysOverdue, zar } from "@/lib/format";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/inbox");
  revalidatePath("/reports");
  revalidatePath("/controls");
  revalidatePath("/playbooks");
}

export type AccountSearchResult = Pick<
  CaseRow,
  "id" | "customerName" | "invoiceNumber" | "status" | "balanceCents" | "days" | "propensity" | "category"
>;

export async function searchAccountsAction(query: string): Promise<AccountSearchResult[]> {
  const result = await listCasesPage({ query: query.trim().slice(0, 100), limit: 8 });
  return result.rows.map(({ id, customerName, invoiceNumber, status, balanceCents, days, propensity, category }) => ({
    id,
    customerName,
    invoiceNumber,
    status,
    balanceCents,
    days,
    propensity,
    category,
  }));
}

export async function runCycleAction(override = false): Promise<CycleResult> {
  const result = await runAgentCycle({ limit: 10, force: true, override });
  revalidateAll();
  return result;
}

export async function simulateInboundAction(): Promise<{ caseId: number; intent: string; action: string }[]> {
  const res = await simulateInbound(3);
  revalidateAll();
  return res;
}

export async function resetDemoAction(): Promise<void> {
  await resetDatabase();
  revalidateAll();
}

export async function inboundReplyAction(caseId: number, body: string) {
  const res = await handleInbound({ caseId, body });
  revalidateAll();
  revalidatePath(`/accounts/${caseId}`);
  return { intent: res.classification.intent, action: res.action, autoReply: res.autoReply, confidence: res.classification.confidence };
}

export async function sendManualMessageAction(caseId: number, channel: string, body: string) {
  const [kase] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, caseId)).limit(1);
  if (!kase) throw new Error("Case not found");
  const now = new Date();
  await db.insert(messages).values({
    caseId,
    customerId: kase.customerId,
    direction: "outbound",
    channel,
    body,
    status: "delivered",
    generatedBy: "staff",
    tone: "human",
    costCents: channel === "voice" ? 120 : channel === "sms" ? 25 : channel === "whatsapp" ? 12 : 2,
  });
  await db
    .update(recoveryCases)
    .set({ lastContactAt: now, status: kase.status === "queued" ? "engaging" : kase.status, updatedAt: now })
    .where(eq(recoveryCases.id, caseId));
  await db.insert(activities).values({
    orgId: kase.orgId,
    caseId,
    type: "message",
    title: `Staff message sent via ${channel}`,
    detail: body.slice(0, 160),
    actor: "staff",
  });
  revalidateAll();
  revalidatePath(`/accounts/${caseId}`);
}

/** Generates the next best message for a case, optionally polished by an LLM. */
export async function draftMessageAction(caseId: number): Promise<{
  channel: string;
  subject: string | null;
  body: string;
  strategy: string;
  propensity: number;
  rationale: string[];
  blocked: { channel: string; reason: string }[];
  refinedByLlm: boolean;
}> {
  const { org, policy } = await getContext();
  const [row] = await db
    .select({ c: recoveryCases, inv: invoices, cust: customers })
    .from(recoveryCases)
    .innerJoin(invoices, eq(invoices.id, recoveryCases.invoiceId))
    .innerJoin(customers, eq(customers.id, recoveryCases.customerId))
    .where(eq(recoveryCases.id, caseId))
    .limit(1);
  if (!row) throw new Error("Case not found");

  const [custConsents, thread] = await Promise.all([
    db.select().from(consents).where(eq(consents.customerId, row.cust.id)),
    db.select().from(messages).where(eq(messages.caseId, caseId)),
  ]);

  const inbound = thread.filter((m) => m.direction === "inbound");
  const outbound = thread.filter((m) => m.direction === "outbound");
  const age = daysOverdue(new Date(row.inv.dueAt));
  const score = scoreAccount({
    amountCents: row.inv.amountCents,
    balanceCents: row.inv.balanceCents,
    dueAt: new Date(row.inv.dueAt),
    category: row.inv.category,
    customerType: row.cust.customerType,
    relationshipMonths: row.cust.relationshipMonths,
    onTimePayments: row.cust.onTimePayments,
    latePayments: row.cust.latePayments,
    brokenPromises: row.cust.brokenPromises,
    lifetimeValueCents: row.cust.lifetimeValueCents,
    inboundReplies: inbound.length,
    outboundTouches: outbound.length,
    hasDispute: row.c.status === "disputed",
    hasActiveArrangement: false,
    hasPartialPayment: row.inv.balanceCents < row.inv.amountCents,
    consentedChannels: custConsents.filter((c) => c.status === "granted").length,
  });

  const repliesByChannel: Record<string, number> = {};
  for (const m of inbound) repliesByChannel[m.channel] = (repliesByChannel[m.channel] ?? 0) + 1;

  const decision = selectChannel({
    policy: policy as PolicyLike,
    consents: custConsents,
    preferredChannel: row.cust.preferredChannel,
    balanceCents: row.inv.balanceCents,
    daysOverdue: age,
    strategy: score.strategy,
    repliesByChannel,
  });

  const channel = decision.channel ?? "email";
  const t = Math.random().toString(36).slice(2, 10).toUpperCase();
  const composed = composeMessage({
    orgName: org.name,
    contactName: row.cust.contactName,
    customerName: row.cust.name,
    invoiceNumber: row.inv.number,
    category: row.inv.category,
    balanceCents: row.inv.balanceCents,
    daysOverdue: age,
    channel,
    strategy: score.strategy,
    goal: STRATEGY_LABEL[score.strategy] ?? "Recover balance",
    tone: policy.tone,
    language: row.cust.language,
    signature: policy.signature,
    payLink: `https://pay.recoup.africa/r/${t}`,
    payReference: `${row.inv.number}-${t.slice(0, 4)}`,
    failureReason: row.inv.failureReason,
  });

  let body = composed.body;
  let refinedByLlm = false;
  if (llmProvider()) {
    const refined = await refineDraft(
      body,
      `Channel: ${channel}. Strategy: ${STRATEGY_LABEL[score.strategy]}. Customer language: ${row.cust.language}. Balance ${zar(row.inv.balanceCents)}, ${age} days overdue. Tone: ${policy.tone}.`,
    );
    if (refined) {
      body = refined;
      refinedByLlm = true;
    }
  }

  return {
    channel,
    subject: composed.subject,
    body,
    strategy: STRATEGY_LABEL[score.strategy] ?? score.strategy,
    propensity: score.propensity,
    rationale: score.rationale,
    blocked: decision.blocked,
    refinedByLlm,
  };
}

export async function markPaidAction(caseId: number, amountRands?: number) {
  const [kase] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, caseId)).limit(1);
  if (!kase) throw new Error("Case not found");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, kase.invoiceId)).limit(1);
  const amount = amountRands && amountRands > 0 ? Math.round(amountRands * 100) : inv.balanceCents;
  const [pending] = await db
    .select()
    .from(paymentRequests)
    .where(and(eq(paymentRequests.caseId, caseId), eq(paymentRequests.status, "pending")))
    .orderBy(desc(paymentRequests.id))
    .limit(1);
  await recordPayment({
    caseId,
    invoiceId: kase.invoiceId,
    amountCents: amount,
    method: "payshap",
    attributedTo: "staff",
    paymentRequestId: pending?.id,
  });
  revalidateAll();
  revalidatePath(`/accounts/${caseId}`);
}

export async function escalateAction(caseId: number, reason: string) {
  const [kase] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, caseId)).limit(1);
  if (!kase) throw new Error("Case not found");
  await db
    .update(recoveryCases)
    .set({
      status: "escalated",
      assignedTo: "Thandi M. (Collections lead)",
      holdReason: reason,
      nextAction: "Human owner to make contact",
      nextActionAt: new Date(Date.now() + 86_400_000),
      updatedAt: new Date(),
    })
    .where(eq(recoveryCases.id, caseId));
  await db.insert(activities).values({
    orgId: kase.orgId,
    caseId,
    type: "escalation",
    title: "Escalated to a human owner",
    detail: reason,
    actor: "staff",
  });
  revalidateAll();
  revalidatePath(`/accounts/${caseId}`);
}

export async function resolveDisputeAction(caseId: number, outcome: "valid" | "invalid", note: string) {
  const [kase] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, caseId)).limit(1);
  if (!kase) throw new Error("Case not found");
  const now = new Date();
  if (outcome === "valid") {
    await db.update(invoices).set({ status: "written_off", balanceCents: 0 }).where(eq(invoices.id, kase.invoiceId));
    await db
      .update(recoveryCases)
      .set({
        status: "closed",
        holdReason: null,
        nextAction: "Credit note issued — account closed",
        nextActionAt: null,
        closedAt: now,
        aiSummary: `Dispute upheld: ${note}. Credit note issued and collections stopped.`,
        updatedAt: now,
      })
      .where(eq(recoveryCases.id, caseId));
  } else {
    await db.update(invoices).set({ status: "overdue" }).where(eq(invoices.id, kase.invoiceId));
    await db
      .update(recoveryCases)
      .set({
        status: "engaging",
        holdReason: null,
        assignedTo: null,
        nextAction: "Resume cadence with the dispute outcome explained",
        nextActionAt: new Date(now.getTime() + 3_600_000),
        aiSummary: `Dispute resolved in our favour: ${note}. Cadence resumed with an explanation message.`,
        updatedAt: now,
      })
      .where(eq(recoveryCases.id, caseId));
  }
  await db.insert(activities).values({
    orgId: kase.orgId,
    caseId,
    type: "dispute",
    title: outcome === "valid" ? "Dispute upheld — credit note" : "Dispute resolved — collections resumed",
    detail: note,
    actor: "staff",
  });
  revalidateAll();
  revalidatePath(`/accounts/${caseId}`);
}

export async function optOutAction(caseId: number) {
  const [kase] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, caseId)).limit(1);
  if (!kase) throw new Error("Case not found");
  await db
    .update(consents)
    .set({ status: "revoked", revokedAt: new Date(), note: "Opted out by staff on behalf of customer" })
    .where(eq(consents.customerId, kase.customerId));
  await db
    .update(recoveryCases)
    .set({
      status: "paused",
      holdReason: "Customer opted out of all channels",
      nextAction: null,
      nextActionAt: null,
      updatedAt: new Date(),
    })
    .where(eq(recoveryCases.id, caseId));
  await db.insert(activities).values({
    orgId: kase.orgId,
    caseId,
    type: "consent",
    title: "Consent revoked on all channels",
    detail: "Outreach suppressed immediately across WhatsApp, SMS, email and voice.",
    actor: "staff",
  });
  revalidateAll();
  revalidatePath(`/accounts/${caseId}`);
}

export async function offerArrangementAction(caseId: number, instalments: number) {
  const { policy } = await getContext();
  const [row] = await db
    .select({ c: recoveryCases, inv: invoices })
    .from(recoveryCases)
    .innerJoin(invoices, eq(invoices.id, recoveryCases.invoiceId))
    .where(eq(recoveryCases.id, caseId))
    .limit(1);
  if (!row) throw new Error("Case not found");

  const proposal = proposeArrangement({
    policy: policy as PolicyLike,
    balanceCents: row.inv.balanceCents,
    propensity: row.c.propensity,
    requestedInstalments: instalments,
    daysOverdue: daysOverdue(new Date(row.inv.dueAt)),
  });

  await db.insert(arrangements).values({
    caseId,
    invoiceId: row.inv.id,
    totalCents: proposal.totalCents,
    depositCents: proposal.depositCents,
    instalments: proposal.instalments,
    instalmentCents: proposal.instalmentCents,
    cadence: proposal.cadence,
    firstDueAt: proposal.firstDueAt,
    status: proposal.approved ? "active" : "proposed",
    approvedBy: proposal.approved ? "ai" : "pending-human",
  });
  await db
    .update(recoveryCases)
    .set({
      status: "arrangement",
      holdReason: proposal.approved ? null : proposal.reason,
      nextAction: `Collect ${zar(proposal.depositCents || proposal.instalmentCents)} first payment`,
      nextActionAt: new Date(Date.now() + 2 * 86_400_000),
      aiSummary: proposal.reason,
      updatedAt: new Date(),
    })
    .where(eq(recoveryCases.id, caseId));
  await db.insert(activities).values({
    orgId: row.c.orgId,
    caseId,
    type: "arrangement",
    title: `Arrangement ${proposal.approved ? "activated" : "proposed (needs approval)"}`,
    detail: proposal.reason,
    actor: proposal.approved ? "ai" : "staff",
    amountCents: proposal.totalCents,
  });
  revalidateAll();
  revalidatePath(`/accounts/${caseId}`);
  return proposal;
}

export async function updatePolicyAction(formData: FormData) {
  const { policy } = await getContext();
  const num = (key: string, fallback: number) => {
    const v = Number(formData.get(key));
    return Number.isFinite(v) ? v : fallback;
  };
  const bool = (key: string) => formData.get(key) === "on" || formData.get(key) === "true";

  await db
    .update(policies)
    .set({
      quietHoursStart: num("quietHoursStart", policy.quietHoursStart),
      quietHoursEnd: num("quietHoursEnd", policy.quietHoursEnd),
      contactSundays: bool("contactSundays"),
      maxContactsPerWeek: num("maxContactsPerWeek", policy.maxContactsPerWeek),
      minHoursBetweenContacts: num("minHoursBetweenContacts", policy.minHoursBetweenContacts),
      allowWhatsapp: bool("allowWhatsapp"),
      allowSms: bool("allowSms"),
      allowEmail: bool("allowEmail"),
      allowVoice: bool("allowVoice"),
      voiceMinBalanceCents: Math.round(num("voiceMinBalanceRands", policy.voiceMinBalanceCents / 100) * 100),
      escalateAboveCents: Math.round(num("escalateAboveRands", policy.escalateAboveCents / 100) * 100),
      escalateAfterDays: num("escalateAfterDays", policy.escalateAfterDays),
      autoNegotiate: bool("autoNegotiate"),
      maxInstalments: num("maxInstalments", policy.maxInstalments),
      minDepositPct: num("minDepositPct", policy.minDepositPct),
      legalActionRequiresHuman: bool("legalActionRequiresHuman"),
      tone: (formData.get("tone") as string) || policy.tone,
      signature: (formData.get("signature") as string) || policy.signature,
      updatedAt: new Date(),
    })
    .where(eq(policies.id, policy.id));

  await db.insert(activities).values({
    orgId: policy.orgId,
    caseId: null,
    type: "policy",
    title: "Communication policy updated",
    detail: "Guardrails changed — the agent picks the new rules up on the next cycle.",
    actor: "staff",
  });
  revalidateAll();
}

export async function togglePlaybookAction(id: number, active: boolean) {
  await db.update(playbooks).set({ active }).where(eq(playbooks.id, id));
  revalidateAll();
}

export async function setConsentAction(customerId: number, channel: string, status: "granted" | "revoked") {
  await db
    .update(consents)
    .set({ status, revokedAt: status === "revoked" ? new Date() : null, note: `Updated by staff (${status})` })
    .where(and(eq(consents.customerId, customerId), eq(consents.channel, channel)));
  revalidateAll();
}
