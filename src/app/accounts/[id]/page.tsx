import Link from "next/link";
import { notFound } from "next/navigation";

import { CaseWorkspace } from "@/components/CaseWorkspace";
import { Badge, Card, ChannelBadge, Empty, ScoreBar, StatusBadge } from "@/components/ui";
import { getCaseDetail } from "@/lib/data";
import { INTENT_META, type Intent } from "@/lib/ai/inbound";
import { STRATEGY_LABEL } from "@/lib/ai/scoring";
import { CATEGORY_META, daysOverdue, formatDate, formatDateTime, relativeTime, zar } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCaseDetail(Number(id));
  if (!detail) notFound();

  const { kase, invoice, customer, messages, consents, arrangements, paymentRequests, payments, activities, policy } = detail;
  const age = daysOverdue(new Date(invoice.dueAt));
  const inboundCount = messages.filter((m) => m.direction === "inbound").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <Link href="/accounts" className="text-[11px] font-medium text-ink3 transition hover:text-mint">
            ← Accounts
          </Link>
          <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em] text-ink">{customer.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span>
              {CATEGORY_META[invoice.category]?.icon} {invoice.number} · {invoice.description}
            </span>
            <StatusBadge status={kase.status} />
            {customer.language !== "en" && (
              <Badge className="border-white/10 bg-white/5 text-slate-300">writes {customer.language.toUpperCase()}</Badge>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tabular-nums text-white">{zar(invoice.balanceCents)}</p>
          <p className="text-xs text-slate-400">
            {age > 0 ? `${age} days overdue` : "not yet due"} · due {formatDate(invoice.dueAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="AI assessment" subtitle={kase.aiSummary ?? undefined}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Propensity to pay</p>
                <div className="mt-1.5">
                  <ScoreBar value={kase.propensity} risk={kase.riskTier} />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">risk tier: {kase.riskTier}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Segment</p>
                <p className="mt-1.5 text-sm text-slate-200">{kase.segment}</p>
                <p className="mt-1 text-[11px] text-slate-500">{STRATEGY_LABEL[kase.playbookKey] ?? kase.playbookKey}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Expected recovery</p>
                <p className="mt-1.5 text-sm text-emerald-300">{zar(Math.round((invoice.balanceCents * kase.propensity) / 100))}</p>
                <p className="mt-1 text-[11px] text-slate-500">priority {kase.priority}/100</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Why the agent scored it this way</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {(kase.aiRationale ?? []).map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-600">•</span>
                    {r}
                  </li>
                ))}
                {(kase.aiRationale ?? []).length === 0 && <li className="text-slate-500">Run a cycle to generate a fresh score.</li>}
              </ul>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Next action</p>
                <p className="mt-1 text-slate-200">{kase.nextAction ?? "—"}</p>
                <p className="mt-1 flex items-center gap-2 text-slate-500">
                  <ChannelBadge channel={kase.nextChannel} /> {kase.nextActionAt ? `scheduled ${formatDateTime(kase.nextActionAt)}` : "unscheduled"}
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Guardrail state</p>
                <p className="mt-1 text-slate-200">{kase.holdReason ?? "No holds — the agent may proceed"}</p>
                <p className="mt-1 text-slate-500">
                  {kase.assignedTo ? `Owner: ${kase.assignedTo}` : "Owner: autonomous agent"} · {kase.contactsThisWeek}/
                  {policy.maxContactsPerWeek} contacts this week
                </p>
              </div>
            </div>
          </Card>

          <Card title="Conversation" subtitle={`${messages.length} messages · ${inboundCount} replies from the customer`}>
            {messages.length === 0 ? (
              <Empty>No messages yet.</Empty>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => {
                  const outbound = m.direction === "outbound";
                  return (
                    <li key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[42rem] rounded-2xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                          outbound
                            ? "border-emerald-400/20 bg-emerald-400/[0.07] text-slate-100"
                            : "border-white/10 bg-white/[0.04] text-slate-200"
                        }`}
                      >
                        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                          <ChannelBadge channel={m.channel} />
                          <span>{outbound ? (m.generatedBy === "staff" ? "staff" : "AI agent") : customer.contactName}</span>
                          <span>· {relativeTime(m.createdAt)}</span>
                          {m.intent && (
                            <Badge className={INTENT_META[m.intent as Intent]?.className ?? "border-white/10 bg-white/5 text-slate-300"}>
                              {INTENT_META[m.intent as Intent]?.label ?? m.intent}
                            </Badge>
                          )}
                        </div>
                        {m.subject && <p className="mb-1 font-medium text-slate-100">{m.subject}</p>}
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Audit trail" subtitle="Every automated decision is recorded">
            {activities.length === 0 ? (
              <Empty>No activity recorded yet.</Empty>
            ) : (
              <ul className="space-y-2">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-2.5 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/70" />
                    <div>
                      <p className="text-slate-200">{a.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {formatDateTime(a.createdAt)} · {a.actor}
                        {a.detail ? ` · ${a.detail}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <CaseWorkspace
            caseId={kase.id}
            status={kase.status}
            balanceRands={Math.round(invoice.balanceCents / 100)}
            maxInstalments={policy.maxInstalments}
          />

          <Card title="Customer" subtitle={customer.contactName}>
            <dl className="space-y-1.5 text-xs">
              {[
                ["Mobile", customer.mobile ?? "—"],
                ["Email", customer.email ?? "—"],
                ["Preferred channel", customer.preferredChannel],
                ["Relationship", `${customer.relationshipMonths} months`],
                ["Payment history", `${customer.onTimePayments} on time · ${customer.latePayments} late · ${customer.brokenPromises} broken promises`],
                ["Lifetime value", zar(customer.lifetimeValueCents)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
            {customer.notes && <p className="mt-3 rounded-lg bg-white/[0.03] p-2 text-[11px] text-slate-400">{customer.notes}</p>}
          </Card>

          <Card title="Consent register" subtitle="POPIA-style record per channel">
            <ul className="space-y-1.5 text-xs">
              {consents.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <ChannelBadge channel={c.channel} />
                  <span
                    className={
                      c.status === "granted" ? "text-emerald-300" : c.status === "revoked" ? "text-rose-300" : "text-slate-500"
                    }
                  >
                    {c.status}
                  </span>
                  <span className="text-[10px] text-slate-600">{c.source}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Money in motion">
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Payment requests</p>
                {paymentRequests.length === 0 ? (
                  <p className="mt-1 text-slate-500">None issued.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {paymentRequests.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2">
                        <span className="text-slate-300">
                          {r.method} · {r.reference}
                        </span>
                        <span className={r.status === "paid" ? "text-emerald-300" : "text-slate-400"}>
                          {zar(r.amountCents)} · {r.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Arrangements</p>
                {arrangements.length === 0 ? (
                  <p className="mt-1 text-slate-500">None.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {arrangements.map((a) => (
                      <li key={a.id} className="text-slate-300">
                        {a.instalments} × {zar(a.instalmentCents)} {a.cadence}
                        {a.depositCents > 0 ? ` after ${zar(a.depositCents)} deposit` : ""} ·{" "}
                        <span className={a.status === "active" ? "text-emerald-300" : "text-amber-300"}>{a.status}</span>
                        <span className="text-slate-600"> ({a.approvedBy})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Payments received</p>
                {payments.length === 0 ? (
                  <p className="mt-1 text-slate-500">Nothing banked yet.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="text-slate-300">
                          {p.method} · {formatDate(p.paidAt)}
                        </span>
                        <span className="text-emerald-300">{zar(p.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
