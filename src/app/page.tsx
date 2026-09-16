import Link from "next/link";
import { Suspense } from "react";

import { AgentConsole } from "@/components/AgentConsole";
import { BarRow, Card, ChannelBadge, Empty, PageHeader, ScoreBar, Stat, StatusBadge } from "@/components/ui";
import {
  agingBreakdown,
  caseRowsFromPortfolio,
  channelPerformance,
  computeKpis,
  loadPortfolio,
  weeklyRecovery,
} from "@/lib/data";
import { CATEGORY_META, relativeTime, zar, zarCompact } from "@/lib/format";
import type { Portfolio } from "@/lib/data";

export const dynamic = "force-dynamic";

const STREAM_FALLBACK = <div className="animate-pulse h-32 bg-panel/40 rounded-xl" aria-hidden />;

async function AgentActivityList({ activities }: { activities: Portfolio["activities"] }) {
  // Separate async component to allow streaming — the parent shell can flush
  // while this list resolves. Props are already resolved in this segment,
  // but marking the component async keeps it on the streaming boundary.
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {activities.slice(0, 14).map((a) => (
        <li key={a.id} className="flex gap-2.5 text-xs">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" />
          <div className="min-w-0">
            <p className="truncate text-slate-200">{a.title}</p>
            <p className="truncate text-[11px] text-slate-500">
              {relativeTime(a.createdAt)} · {a.actor} {a.detail ? `· ${a.detail}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  let portfolio: Portfolio;
  try {
    portfolio = await loadPortfolio();
  } catch (e) {
    const msg = (e as Error).message ?? "Database unavailable";
    const isMissingDb = msg.includes("DATABASE_URL") || msg.includes("organizations") || msg.includes("Failed query") || msg.includes("connect");
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-brass/20 bg-gradient-to-br from-panel/80 to-panel2/60 p-8 shadow-card">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brass/15 text-brass ring-1 ring-brass/20">◈</div>
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brass">Vault not connected</p>
              <h1 className="mt-1 font-display text-[26px] font-semibold tracking-tight text-ink">Connect your ledger to arm Recoup</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-ink2">
                {isMissingDb
                  ? "Postgres is not reachable at DATABASE_URL. On Vercel add a Postgres (Neon/Vercel Postgres) and set DATABASE_URL, then redeploy. Locally: docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16 && npx drizzle-kit push && npm run dev."
                  : msg}
              </p>
              <div className="mt-4 flex gap-2">
                <a href="/api/health" className="btn btn-primary btn-sm">
                  Check health →
                </a>
                <a href="/controls" className="btn btn-quiet btn-sm">
                  View guardrails
                </a>
              </div>
              <p className="mt-3 font-mono text-[11px] text-ink3">DATABASE_URL={process.env.DATABASE_URL ? "set" : "missing"} · {msg.slice(0, 160)}</p>
            </div>
          </div>
        </div>
        <Card title="Forensic Vault — preview mode" subtitle="UI is live, data will stream once the ledger connects">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Recovered · 30 days" value="—" hint="Connect DB to see live KPIs" accent="emerald" icon="◈" />
            <Stat label="Overdue in flight" value="—" hint="Vault sealed" accent="sky" icon="⬥" />
            <Stat label="AI expected recovery" value="—" hint="Propensity engine standby" accent="violet" icon="⬢" />
            <Stat label="Cost per R100" value="—" hint="Messaging ledger offline" accent="slate" icon="⬣" />
          </div>
        </Card>
      </div>
    );
  }
  const kpis = computeKpis(portfolio);
  const aging = agingBreakdown(portfolio);
  const channels = channelPerformance(portfolio);
  const weekly = weeklyRecovery(portfolio);
  const cases = caseRowsFromPortfolio(portfolio);

  const queue = cases
    .filter((c) => !["recovered", "closed", "paused"].includes(c.status))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 7);
  const attention = cases.filter((c) => ["escalated", "disputed"].includes(c.status)).slice(0, 5);
  const maxAging = Math.max(...aging.map((a) => a.cents), 1);
  const maxWeek = Math.max(...weekly.map((w) => w.cents), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command centre"
        title="Collections on autopilot — humans where it counts"
        description="The agent scores every overdue account, picks a compliant channel, sends a PayShap-ready payment request and hands anything sensitive to a person. Everything below is live from the ledger."
      >
        <AgentConsole />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Recovered · 30 days" value={zar(kpis.recovered30)} hint={`${zar(kpis.recovered7)} in the last 7 days`} accent="emerald" icon="💰" />
        <Stat label="Overdue in flight" value={zar(kpis.inFlightValue)} hint={`${kpis.activeCases} active accounts`} accent="sky" icon="⏳" />
        <Stat
          label="AI expected recovery"
          value={zar(kpis.expectedRecovery)}
          hint="Propensity-weighted forecast on open cases"
          accent="violet"
          icon="🔮"
        />
        <Stat
          label="Cost per R100 recovered"
          value={`R${(kpis.costPerRandCents / 100).toFixed(2)}`}
          hint={`${zar(kpis.commsCost30)} messaging spend · 30 days`}
          accent="slate"
          icon="📉"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Collection rate" value={`${kpis.recoveryRate}%`} hint="Recovered ÷ (recovered + overdue)" accent="emerald" />
        <Stat label="Avg days to cash" value={`${kpis.avgDaysToCash} days`} hint="Open → paid on recovered cases" accent="sky" />
        <Stat label="Promises + arrangements" value={zar(kpis.promisedValue + kpis.arrangementValue)} hint="Committed but not yet banked" accent="amber" />
        <Stat label="Needs a human" value={`${kpis.needsHuman}`} hint={`${kpis.optedOut} opted out & suppressed`} accent="rose" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Work queue — ranked by recoverable rands"
          subtitle="Priority blends balance, ageing and likelihood to pay"
          action={
            <Link href="/accounts" className="text-xs font-medium text-emerald-300 hover:text-emerald-200">
              All accounts →
            </Link>
          }
        >
          {queue.length === 0 ? (
            <Empty>Nothing queued. Run a cycle to put the agent to work.</Empty>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[46rem] border-separate border-spacing-y-1 px-2 text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-2 py-1 font-medium">Account</th>
                    <th className="px-2 py-1 font-medium">Balance</th>
                    <th className="px-2 py-1 font-medium">Age</th>
                    <th className="px-2 py-1 font-medium">Pay propensity</th>
                    <th className="px-2 py-1 font-medium">Next move</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((c) => (
                    <tr key={c.id} className="group rounded-xl bg-white/[0.02] transition hover:bg-white/[0.05]">
                      <td className="max-w-[15rem] px-2 py-2.5">
                        <Link href={`/accounts/${c.id}`} className="block">
                          <p className="truncate font-medium text-slate-100 group-hover:text-white">{c.customerName}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            {CATEGORY_META[c.category]?.icon} {c.invoiceNumber} · {c.segment}
                          </p>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 font-medium tabular-nums text-slate-100">{zar(c.balanceCents)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-slate-400">{c.days}d</td>
                      <td className="px-2 py-2.5">
                        <ScoreBar value={c.propensity} risk={c.riskTier} />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <ChannelBadge channel={c.nextChannel} />
                          <span className="truncate text-[11px] text-slate-400">{c.holdReason ?? c.nextAction ?? "—"}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Needs a human" subtitle="Disputes and high-value escalations the agent will not touch">
            {attention.length === 0 ? (
              <Empty>Nothing escalated. The agent is handling the book.</Empty>
            ) : (
              <ul className="space-y-2">
                {attention.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/accounts/${c.id}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:bg-white/[0.05]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100">{c.customerName}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{c.holdReason ?? c.aiSummary}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge status={c.status} />
                        <p className="mt-1 text-xs tabular-nums text-slate-300">{zarCompact(c.balanceCents)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Suspense fallback={STREAM_FALLBACK}>
            <Card title="Recovered by week" subtitle="Cash actually banked">
              <div className="flex h-28 items-end gap-1.5">
                {weekly.map((w) => (
                  <div key={w.label} className="group flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] text-slate-500 opacity-0 transition group-hover:opacity-100">{zarCompact(w.cents)}</span>
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-emerald-600/40 to-emerald-400"
                      style={{ height: `${Math.max(4, (w.cents / maxWeek) * 100)}%` }}
                    />
                    <span className="text-[9px] text-slate-500">{w.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Suspense>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Ageing of open balances" subtitle={`${zar(kpis.openBalance)} outstanding across the book`}>
          {aging.map((a) => (
            <BarRow
              key={a.bucket}
              label={a.bucket === "Current" ? "Current" : `${a.bucket} days`}
              value={a.cents}
              max={maxAging}
              caption={`${zarCompact(a.cents)} · ${a.count}`}
              color={
                a.bucket === "Current"
                  ? "bg-emerald-400/80"
                  : a.bucket === "90+"
                    ? "bg-rose-400/80"
                    : a.bucket === "61-90"
                      ? "bg-amber-400/80"
                      : "bg-sky-400/80"
              }
            />
          ))}
        </Card>

        <Suspense fallback={STREAM_FALLBACK}>
          <Card title="Channel performance" subtitle={`${kpis.replyRate}% reply rate over ${kpis.touches30} touches`}>
            <ul className="space-y-2.5">
              {channels.map((c) => (
                <li key={c.channel} className="flex items-center justify-between gap-3 text-sm">
                  <ChannelBadge channel={c.channel} />
                  <div className="flex-1 px-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-sky-400/80" style={{ width: `${Math.min(100, c.replyRate)}%` }} />
                    </div>
                  </div>
                  <span className="w-24 text-right text-[11px] tabular-nums text-slate-400">
                    {c.sent} sent · {c.replyRate}%
                  </span>
                  <span className="w-16 text-right text-xs tabular-nums text-emerald-300">{zarCompact(c.recovered)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Suspense>

        <Card title="Agent activity" subtitle="Everything is logged for audit">
          <Suspense fallback={STREAM_FALLBACK}>
            <AgentActivityList activities={portfolio.activities} />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
