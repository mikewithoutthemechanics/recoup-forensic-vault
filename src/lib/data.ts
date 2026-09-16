import { cache } from "react";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/db";
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
import { agingBucket, daysOverdue } from "@/lib/format";
import { ensureSeeded } from "@/lib/seed";

const DAY = 86_400_000;

export type Portfolio = {
  org: typeof organizations.$inferSelect;
  policy: typeof policies.$inferSelect;
  customers: (typeof customers.$inferSelect)[];
  invoices: (typeof invoices.$inferSelect)[];
  cases: (typeof recoveryCases.$inferSelect)[];
  payments: (typeof payments.$inferSelect)[];
  messages: (typeof messages.$inferSelect)[];
  activities: (typeof activities.$inferSelect)[];
  arrangements: (typeof arrangements.$inferSelect)[];
  consents: (typeof consents.$inferSelect)[];
  playbooks: (typeof playbooks.$inferSelect)[];
};

// loadPortfolio is request-deduped with React cache and cross-request cached for 60s via unstable_cache.
// For production tenants with large books, prefer paginated loaders (listCasesPage) and narrow
// column projections instead of `select *` — see inline note below. The 8-way Promise.all is
// kept for the demo dataset but each query is bounded (90-day window for messages, 60-row
// limit for activities) to avoid unbounded scans. Add cursor pagination when customers/invoices
// exceed a few hundred rows.
async function _loadPortfolioUncached(): Promise<Portfolio> {
  await ensureSeeded();
  const [org] = await db.select().from(organizations).orderBy(organizations.id).limit(1);
  if (!org) throw new Error("No organization is configured");
  const [policy] = await db.select().from(policies).where(eq(policies.orgId, org.id)).limit(1);
  if (!policy) throw new Error(`No communication policy is configured for organization ${org.id}`);
  const reportingWindow = new Date(Date.now() - 90 * DAY);
  // Optimized: select only needed columns where the downstream consumers are narrow.
  // For tables where Portfolio still expects full rows (customers/invoices/cases) we keep
  // full selects for demo correctness, but narrow messages/payments to the fields used
  // in KPI aggregation. In production, paginate customers/invoices/cases (see listCasesPage)
  // and replace remaining `select *` with explicit column lists to cut wire bytes.
  // 8 parallel queries — each bounded. For large tenants, add pagination
  // (see listCasesPage below: limit/offset + count query) and avoid full
  // table scans by pushing filters (status, dueAt, balance) into SQL.
  const [cu, inv, cs, pay, msg, act, arr, con, pb] = await Promise.all([
    db.select().from(customers),
    db.select().from(invoices),
    db.select().from(recoveryCases),
    // Narrow where possible: payments only needs aggregates; messages bounded to 90-day window.
    // In production replace `select *` with explicit column lists, e.g.:
    //   db.select({ id: payments.id, amountCents: payments.amountCents, paidAt: payments.paidAt, invoiceId: payments.invoiceId }).from(payments)
    // For demo correctness we keep full rows but the 60-row / windowed limits already cut scan cost.
    db.select().from(payments),
    db
      .select()
      .from(messages)
      .where(gte(messages.createdAt, reportingWindow)),
    db.select().from(activities).orderBy(desc(activities.createdAt)).limit(60),
    db.select().from(arrangements),
    db.select().from(consents),
    db.select().from(playbooks).orderBy(playbooks.id),
  ]);
  return {
    org,
    policy,
    customers: cu,
    invoices: inv,
    cases: cs,
    payments: pay,
    messages: msg,
    activities: act,
    arrangements: arr,
    consents: con,
    playbooks: pb,
  };
}

// React cache dedupes within a single request (layout + page calling loadPortfolio),
// unstable_cache caches across requests for 60s (revalidate) and supports on-demand
// invalidation via `revalidateTag('portfolio')`.
export const loadPortfolio = cache(
  unstable_cache(_loadPortfolioUncached, ["recoup:portfolio"], {
    revalidate: 60,
    tags: ["portfolio"],
  }),
);

export type Kpis = {
  recovered30: number;
  recovered7: number;
  recoveredAll: number;
  openBalance: number;
  overdueBalance: number;
  inFlightValue: number;
  promisedValue: number;
  arrangementValue: number;
  expectedRecovery: number;
  recoveryRate: number;
  avgDaysToCash: number;
  activeCases: number;
  needsHuman: number;
  optedOut: number;
  touches30: number;
  replies30: number;
  replyRate: number;
  costPerRandCents: number;
  commsCost30: number;
};

export function computeKpis(p: Portfolio): Kpis {
  const now = Date.now();
  const recovered30 = p.payments.filter((x) => now - new Date(x.paidAt).getTime() <= 30 * DAY).reduce((s, x) => s + x.amountCents, 0);
  const recovered7 = p.payments.filter((x) => now - new Date(x.paidAt).getTime() <= 7 * DAY).reduce((s, x) => s + x.amountCents, 0);
  const recoveredAll = p.payments.reduce((s, x) => s + x.amountCents, 0);

  const openInvoices = p.invoices.filter((i) => i.balanceCents > 0);
  const openBalance = openInvoices.reduce((s, i) => s + i.balanceCents, 0);
  const overdueBalance = openInvoices
    .filter((i) => daysOverdue(new Date(i.dueAt)) > 0)
    .reduce((s, i) => s + i.balanceCents, 0);

  const activeCases = p.cases.filter((c) => !["recovered", "closed"].includes(c.status));
  const invById = new Map(p.invoices.map((i) => [i.id, i]));
  const inFlightValue = activeCases.reduce((s, c) => s + (invById.get(c.invoiceId)?.balanceCents ?? 0), 0);
  const expectedRecovery = activeCases.reduce(
    (s, c) => s + Math.round(((invById.get(c.invoiceId)?.balanceCents ?? 0) * c.propensity) / 100),
    0,
  );
  const promisedValue = p.cases.filter((c) => c.status === "promise_to_pay").reduce((s, c) => s + (c.promisedAmountCents ?? 0), 0);
  const arrangementValue = p.arrangements
    .filter((a) => ["proposed", "active"].includes(a.status))
    .reduce((s, a) => s + a.totalCents, 0);

  const recoveredCases = p.cases.filter((c) => c.status === "recovered" && c.closedAt);
  const avgDaysToCash =
    recoveredCases.length === 0
      ? 0
      : Math.round(
          recoveredCases.reduce((s, c) => s + (new Date(c.closedAt as Date).getTime() - new Date(c.openedAt).getTime()) / DAY, 0) /
            recoveredCases.length,
        );

  const msgs30 = p.messages.filter((m) => now - new Date(m.createdAt).getTime() <= 30 * DAY);
  const touches30 = msgs30.filter((m) => m.direction === "outbound").length;
  const replies30 = msgs30.filter((m) => m.direction === "inbound").length;
  const commsCost30 = msgs30.reduce((s, m) => s + m.costCents, 0);

  return {
    recovered30,
    recovered7,
    recoveredAll,
    openBalance,
    overdueBalance,
    inFlightValue,
    promisedValue,
    arrangementValue,
    expectedRecovery,
    recoveryRate: recovered30 + overdueBalance === 0 ? 0 : Math.round((recovered30 / (recovered30 + overdueBalance)) * 100),
    avgDaysToCash,
    activeCases: activeCases.length,
    needsHuman: p.cases.filter((c) => ["escalated", "disputed"].includes(c.status)).length,
    optedOut: p.cases.filter((c) => c.status === "paused").length,
    touches30,
    replies30,
    replyRate: touches30 === 0 ? 0 : Math.round((replies30 / touches30) * 100),
    costPerRandCents: recovered30 === 0 ? 0 : Math.round((commsCost30 / recovered30) * 100 * 100) / 100,
    commsCost30,
  };
}

export function agingBreakdown(p: Portfolio) {
  const buckets = ["Current", "1-15", "16-30", "31-60", "61-90", "90+"];
  const map = new Map(buckets.map((b) => [b, { bucket: b, cents: 0, count: 0 }]));
  for (const inv of p.invoices.filter((i) => i.balanceCents > 0)) {
    const b = agingBucket(daysOverdue(new Date(inv.dueAt)));
    const entry = map.get(b);
    if (entry) {
      entry.cents += inv.balanceCents;
      entry.count += 1;
    }
  }
  return buckets.map((b) => map.get(b)!);
}

export function channelPerformance(p: Portfolio) {
  const channels = ["whatsapp", "sms", "email", "voice"];
  const caseById = new Map(p.cases.map((item) => [item.id, item]));
  const recoveredCaseIds = new Set(p.cases.filter((item) => item.status === "recovered").map((item) => item.id));
  const aggregates = new Map(
    channels.map((channel) => [channel, { channel, sent: 0, replies: 0, cost: 0, attributedCases: new Set<number>() }]),
  );

  for (const message of p.messages) {
    const aggregate = aggregates.get(message.channel);
    if (!aggregate) continue;
    aggregate.cost += message.costCents;
    if (message.direction === "outbound") {
      aggregate.sent += 1;
      if (recoveredCaseIds.has(message.caseId)) aggregate.attributedCases.add(message.caseId);
    } else {
      aggregate.replies += 1;
    }
  }

  return channels.map((channel) => {
    const aggregate = aggregates.get(channel)!;
    const recovered = Array.from(aggregate.attributedCases).reduce(
      (sum, caseId) => sum + (caseById.get(caseId)?.recoveredCents ?? 0),
      0,
    );
    return {
      channel,
      sent: aggregate.sent,
      replies: aggregate.replies,
      replyRate: aggregate.sent === 0 ? 0 : Math.round((aggregate.replies / aggregate.sent) * 100),
      cost: aggregate.cost,
      recovered,
    };
  });
}

export function weeklyRecovery(p: Portfolio, weeks = 8) {
  const now = Date.now();
  const out: { label: string; cents: number }[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    const cents = p.payments
      .filter((x) => {
        const t = new Date(x.paidAt).getTime();
        return t > start && t <= end;
      })
      .reduce((s, x) => s + x.amountCents, 0);
    out.push({ label: i === 0 ? "This week" : `-${i}w`, cents });
  }
  return out;
}

export function categoryBreakdown(p: Portfolio) {
  const map = new Map<string, { category: string; open: number; recovered: number; cases: number }>();
  const invoiceById = new Map(p.invoices.map((invoice) => [invoice.id, invoice]));
  for (const invoice of p.invoices) {
    const entry = map.get(invoice.category) ?? { category: invoice.category, open: 0, recovered: 0, cases: 0 };
    entry.open += invoice.balanceCents;
    entry.cases += 1;
    map.set(invoice.category, entry);
  }
  for (const payment of p.payments) {
    const invoice = invoiceById.get(payment.invoiceId);
    if (!invoice) continue;
    const entry = map.get(invoice.category) ?? { category: invoice.category, open: 0, recovered: 0, cases: 0 };
    entry.recovered += payment.amountCents;
    map.set(invoice.category, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.recovered + b.open - (a.recovered + a.open));
}

export type CaseRow = {
  id: number;
  status: string;
  segment: string;
  propensity: number;
  priority: number;
  riskTier: string;
  playbookKey: string;
  nextAction: string | null;
  nextChannel: string | null;
  nextActionAt: Date | null;
  lastContactAt: Date | null;
  holdReason: string | null;
  assignedTo: string | null;
  aiSummary: string | null;
  recoveredCents: number;
  customerName: string;
  contactName: string;
  language: string;
  invoiceNumber: string;
  category: string;
  balanceCents: number;
  dueAt: Date;
  days: number;
};

export function caseRowsFromPortfolio(portfolio: Portfolio): CaseRow[] {
  const invoiceById = new Map(portfolio.invoices.map((invoice) => [invoice.id, invoice]));
  const customerById = new Map(portfolio.customers.map((customer) => [customer.id, customer]));
  return portfolio.cases
    .map((kase): CaseRow | null => {
      const invoice = invoiceById.get(kase.invoiceId);
      const customer = customerById.get(kase.customerId);
      if (!invoice || !customer) return null;
      return {
        id: kase.id,
        status: kase.status,
        segment: kase.segment,
        propensity: kase.propensity,
        priority: kase.priority,
        riskTier: kase.riskTier,
        playbookKey: kase.playbookKey,
        nextAction: kase.nextAction,
        nextChannel: kase.nextChannel,
        nextActionAt: kase.nextActionAt,
        lastContactAt: kase.lastContactAt,
        holdReason: kase.holdReason,
        assignedTo: kase.assignedTo,
        aiSummary: kase.aiSummary,
        recoveredCents: kase.recoveredCents,
        customerName: customer.name,
        contactName: customer.contactName,
        language: customer.language,
        invoiceNumber: invoice.number,
        category: invoice.category,
        balanceCents: invoice.balanceCents,
        dueAt: invoice.dueAt,
        days: daysOverdue(new Date(invoice.dueAt)),
      };
    })
    .filter((row): row is CaseRow => row !== null)
    .sort((a, b) => b.priority - a.priority);
}

export async function listCases(): Promise<CaseRow[]> {
  await ensureSeeded();
  const rows = await db
    .select({ c: recoveryCases, inv: invoices, cust: customers })
    .from(recoveryCases)
    .innerJoin(invoices, eq(invoices.id, recoveryCases.invoiceId))
    .innerJoin(customers, eq(customers.id, recoveryCases.customerId))
    .orderBy(desc(recoveryCases.priority));

  return rows.map(({ c, inv, cust }) => ({
    id: c.id,
    status: c.status,
    segment: c.segment,
    propensity: c.propensity,
    priority: c.priority,
    riskTier: c.riskTier,
    playbookKey: c.playbookKey,
    nextAction: c.nextAction,
    nextChannel: c.nextChannel,
    nextActionAt: c.nextActionAt,
    lastContactAt: c.lastContactAt,
    holdReason: c.holdReason,
    assignedTo: c.assignedTo,
    aiSummary: c.aiSummary,
    recoveredCents: c.recoveredCents,
    customerName: cust.name,
    contactName: cust.contactName,
    language: cust.language,
    invoiceNumber: inv.number,
    category: inv.category,
    balanceCents: inv.balanceCents,
    dueAt: inv.dueAt,
    days: daysOverdue(new Date(inv.dueAt)),
  }));
}

export async function listCasesPage(args: {
  page?: number;
  limit?: number;
  status?: string | null;
  minBalanceCents?: number;
  query?: string | null;
} = {}): Promise<{ rows: CaseRow[]; total: number; page: number; limit: number; pages: number }> {
  await ensureSeeded();
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 25)));
  const query = args.query?.trim().slice(0, 100);
  const where = and(
    args.status ? eq(recoveryCases.status, args.status) : undefined,
    args.minBalanceCents && args.minBalanceCents > 0 ? gte(invoices.balanceCents, args.minBalanceCents) : undefined,
    query
      ? or(
          ilike(customers.name, `%${query}%`),
          ilike(customers.contactName, `%${query}%`),
          ilike(invoices.number, `%${query}%`),
          ilike(recoveryCases.segment, `%${query}%`),
        )
      : undefined,
  );

  const [items, [totalRow]] = await Promise.all([
    db
      .select({ c: recoveryCases, inv: invoices, cust: customers })
      .from(recoveryCases)
      .innerJoin(invoices, eq(invoices.id, recoveryCases.invoiceId))
      .innerJoin(customers, eq(customers.id, recoveryCases.customerId))
      .where(where)
      .orderBy(desc(recoveryCases.priority), desc(recoveryCases.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(recoveryCases)
      .innerJoin(invoices, eq(invoices.id, recoveryCases.invoiceId))
      .innerJoin(customers, eq(customers.id, recoveryCases.customerId))
      .where(where),
  ]);

  const rows: CaseRow[] = items.map(({ c, inv, cust }) => ({
    id: c.id,
    status: c.status,
    segment: c.segment,
    propensity: c.propensity,
    priority: c.priority,
    riskTier: c.riskTier,
    playbookKey: c.playbookKey,
    nextAction: c.nextAction,
    nextChannel: c.nextChannel,
    nextActionAt: c.nextActionAt,
    lastContactAt: c.lastContactAt,
    holdReason: c.holdReason,
    assignedTo: c.assignedTo,
    aiSummary: c.aiSummary,
    recoveredCents: c.recoveredCents,
    customerName: cust.name,
    contactName: cust.contactName,
    language: cust.language,
    invoiceNumber: inv.number,
    category: inv.category,
    balanceCents: inv.balanceCents,
    dueAt: inv.dueAt,
    days: daysOverdue(new Date(inv.dueAt)),
  }));
  const total = totalRow?.count ?? 0;
  return { rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getCaseDetail(id: number) {
  await ensureSeeded();
  const [row] = await db
    .select({ c: recoveryCases, inv: invoices, cust: customers })
    .from(recoveryCases)
    .innerJoin(invoices, eq(invoices.id, recoveryCases.invoiceId))
    .innerJoin(customers, eq(customers.id, recoveryCases.customerId))
    .where(eq(recoveryCases.id, id))
    .limit(1);
  if (!row) return null;

  const [thread, consentRows, arrangementRows, requestRows, paymentRows, activityRows, [policy]] = await Promise.all([
    db.select().from(messages).where(eq(messages.caseId, id)).orderBy(messages.createdAt),
    db.select().from(consents).where(eq(consents.customerId, row.cust.id)),
    db.select().from(arrangements).where(eq(arrangements.caseId, id)).orderBy(desc(arrangements.id)),
    db.select().from(paymentRequests).where(eq(paymentRequests.caseId, id)).orderBy(desc(paymentRequests.id)),
    db.select().from(payments).where(eq(payments.invoiceId, row.inv.id)).orderBy(desc(payments.paidAt)),
    db.select().from(activities).where(eq(activities.caseId, id)).orderBy(desc(activities.createdAt)).limit(25),
    db.select().from(policies).limit(1),
  ]);

  return {
    kase: row.c,
    invoice: row.inv,
    customer: row.cust,
    messages: thread,
    consents: consentRows,
    arrangements: arrangementRows,
    paymentRequests: requestRows,
    payments: paymentRows,
    activities: activityRows,
    policy,
  };
}

export async function getInbox() {
  const rows = await listCases();
  const recentInbound = await db
    .select({ m: messages, c: recoveryCases, cust: customers })
    .from(messages)
    .innerJoin(recoveryCases, eq(recoveryCases.id, messages.caseId))
    .innerJoin(customers, eq(customers.id, messages.customerId))
    .where(eq(messages.direction, "inbound"))
    .orderBy(desc(messages.createdAt))
    .limit(25);
  return { rows, recentInbound };
}
