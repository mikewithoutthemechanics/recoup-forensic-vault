import { BarRow, Card, ChannelBadge, PageHeader, Stat } from "@/components/ui";
import { agingBreakdown, categoryBreakdown, channelPerformance, computeKpis, loadPortfolio, weeklyRecovery } from "@/lib/data";
import { CATEGORY_META, zar, zarCompact } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const p = await loadPortfolio();
  const kpis = computeKpis(p);
  const weekly = weeklyRecovery(p, 10);
  const byCategory = categoryBreakdown(p);
  const channels = channelPerformance(p);
  const aging = agingBreakdown(p);

  const maxWeek = Math.max(...weekly.map((w) => w.cents), 1);
  const maxCategory = Math.max(...byCategory.map((c) => c.recovered + c.open), 1);
  const roi = kpis.commsCost30 === 0 ? 0 : Math.round(kpis.recovered30 / kpis.commsCost30);
  const touchesPerAgentDay = 45;
  const headcountEquivalent = (kpis.touches30 / (touchesPerAgentDay * 22)).toFixed(1);
  const playbookRows = [...p.playbooks].sort((a, b) => b.recoveredCents - a.recoveredCents);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recovered value"
        title="What the agent actually brought back"
        description="The only numbers that matter: cash banked, what it cost to recover, and the value still moving through the pipeline."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Recovered · all time" value={zar(kpis.recoveredAll)} hint={`${zar(kpis.recovered30)} in the last 30 days`} accent="emerald" icon="💰" />
        <Stat label="Messaging spend · 30d" value={zar(kpis.commsCost30)} hint={`${kpis.touches30} touches sent`} accent="slate" icon="📨" />
        <Stat label="Return on spend" value={`${roi}×`} hint="Rands recovered per rand of messaging" accent="violet" icon="📈" />
        <Stat label="Headcount equivalent" value={`${headcountEquivalent} FTE`} hint={`At ${touchesPerAgentDay} manual touches per agent per day`} accent="sky" icon="🧑‍💼" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Cash recovered by week" subtitle="Last 10 weeks, banked payments only">
          <div className="flex h-48 items-end gap-2">
            {weekly.map((w) => (
              <div key={w.label} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] text-slate-400">{w.cents > 0 ? zarCompact(w.cents) : ""}</span>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-emerald-600/40 to-emerald-400 transition group-hover:from-emerald-500/60"
                  style={{ height: `${Math.max(3, (w.cents / maxWeek) * 100)}%` }}
                />
                <span className="text-[10px] text-slate-500">{w.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pipeline" subtitle="What the agent still expects to convert">
          <div className="space-y-3 text-sm">
            {[
              ["Overdue in flight", zar(kpis.inFlightValue), "text-slate-100"],
              ["Propensity-weighted forecast", zar(kpis.expectedRecovery), "text-emerald-300"],
              ["Promises to pay", zar(kpis.promisedValue), "text-violet-300"],
              ["Arrangements committed", zar(kpis.arrangementValue), "text-sky-300"],
              ["Under suppression (opt-out)", zar(p.cases.filter((c) => c.status === "paused").reduce((s, c) => s + (p.invoices.find((i) => i.id === c.invoiceId)?.balanceCents ?? 0), 0)), "text-slate-400"],
            ].map(([k, v, cls]) => (
              <div key={k} className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
                <span className="text-xs text-slate-400">{k}</span>
                <span className={`tabular-nums ${cls}`}>{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-white/[0.03] p-2.5 text-[11px] leading-relaxed text-slate-400">
            Forecast = Σ (open balance × propensity). It moves every time the agent rescoring runs, a customer replies or
            a payment lands.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="By receivable type" subtitle="Open vs recovered">
          {byCategory.map((c) => (
            <div key={c.category} className="mb-2 last:mb-0">
              <BarRow
                label={`${CATEGORY_META[c.category]?.icon ?? ""} ${(CATEGORY_META[c.category]?.label ?? c.category).split(" ")[0]}`}
                value={c.recovered}
                max={maxCategory}
                caption={`${zarCompact(c.recovered)} in`}
                color="bg-emerald-400/80"
              />
              <BarRow label="" value={c.open} max={maxCategory} caption={`${zarCompact(c.open)} open`} color="bg-white/15" />
            </div>
          ))}
        </Card>

        <Card title="Channel economics" subtitle="Cost, engagement and attributed cash">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Channel</th>
                <th className="pb-2 font-medium">Sent</th>
                <th className="pb-2 font-medium">Reply</th>
                <th className="pb-2 font-medium">Cost</th>
                <th className="pb-2 text-right font-medium">Recovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {channels.map((c) => (
                <tr key={c.channel}>
                  <td className="py-2">
                    <ChannelBadge channel={c.channel} />
                  </td>
                  <td className="py-2 tabular-nums text-slate-300">{c.sent}</td>
                  <td className="py-2 tabular-nums text-slate-300">{c.replyRate}%</td>
                  <td className="py-2 tabular-nums text-slate-400">{zar(c.cost)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-300">{zarCompact(c.recovered)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            WhatsApp carries the volume at roughly R0.12 a message; voice is reserved for large, aged balances where the
            call is worth it.
          </p>
        </Card>

        <Card title="Playbook performance" subtitle="Recovered per cadence">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Playbook</th>
                <th className="pb-2 font-medium">Touches</th>
                <th className="pb-2 text-right font-medium">Recovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {playbookRows.map((b) => (
                <tr key={b.id}>
                  <td className="max-w-[10rem] truncate py-2 text-slate-200">{b.name}</td>
                  <td className="py-2 tabular-nums text-slate-400">{b.touches}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-300">{zarCompact(b.recoveredCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ageing profile" subtitle={`${zar(kpis.openBalance)} open · ${zar(kpis.overdueBalance)} overdue`}>
          {aging.map((a) => (
            <BarRow
              key={a.bucket}
              label={a.bucket === "Current" ? "Current" : `${a.bucket} days`}
              value={a.cents}
              max={Math.max(...aging.map((x) => x.cents), 1)}
              caption={`${zarCompact(a.cents)} · ${a.count} inv`}
              color={a.bucket === "90+" ? "bg-rose-400/80" : a.bucket === "61-90" ? "bg-amber-400/80" : "bg-sky-400/80"}
            />
          ))}
        </Card>

        <Card title="The business case" subtitle="How this shows up in the monthly numbers">
          <div className="space-y-2.5 text-xs leading-relaxed text-slate-300">
            <p>
              Over the last 30 days the agent sent <strong className="text-white">{kpis.touches30}</strong> compliant touches,
              handled <strong className="text-white">{kpis.replies30}</strong> replies without a human, and banked{" "}
              <strong className="text-emerald-300">{zar(kpis.recovered30)}</strong> for{" "}
              <strong className="text-white">{zar(kpis.commsCost30)}</strong> in messaging.
            </p>
            <p>
              Average time from overdue to cash is <strong className="text-white">{kpis.avgDaysToCash} days</strong>, and{" "}
              <strong className="text-white">{kpis.recoveryRate}%</strong> of the collectable pool converted. The pipeline
              still holds <strong className="text-emerald-300">{zar(kpis.expectedRecovery)}</strong> of propensity-weighted
              value.
            </p>
            <p className="rounded-lg bg-white/[0.03] p-2.5 text-slate-400">
              Because 80% of PayShap volume is under R500, small balances that used to be written off as &ldquo;not worth
              chasing&rdquo; now settle with a single tap — which is where most of the incremental recovery in the small-ticket
              buckets comes from.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
