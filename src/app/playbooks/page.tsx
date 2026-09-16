import { PlaybookToggle } from "@/components/PlaybookToggle";
import { Badge, Card, ChannelBadge, PageHeader, Stat } from "@/components/ui";
import { loadPortfolio } from "@/lib/data";
import { CATEGORY_META, zar } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlaybooksPage() {
  const p = await loadPortfolio();
  const books = p.playbooks;
  const totalRecovered = books.reduce((s, b) => s + b.recoveredCents, 0);
  const totalTouches = books.reduce((s, b) => s + b.touches, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Playbooks"
        title="The cadences behind every touch"
        description="A playbook is the sequence the agent runs once an account lands in a segment. Channels escalate gently, tone adapts to history, and every step still passes consent, quiet-hours and frequency checks. Disabled playbooks put accounts on hold."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Playbooks live" value={`${books.filter((b) => b.active).length}/${books.length}`} accent="emerald" />
        <Stat label="Recovered by playbooks" value={zar(totalRecovered)} hint="Attributed to the closing cadence" accent="sky" />
        <Stat label="Touches sent" value={`${totalTouches}`} hint="Across every channel" accent="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {books.map((b) => (
          <Card
            key={b.id}
            title={
              <span className="flex items-center gap-2">
                {b.name}
                <Badge className="border-white/10 bg-white/5 text-slate-400">
                  {CATEGORY_META[b.category]?.icon} {CATEGORY_META[b.category]?.label ?? b.category}
                </Badge>
              </span>
            }
            subtitle={b.description}
            action={<PlaybookToggle id={b.id} active={b.active} />}
          >
            <ol className="space-y-2">
              {b.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[11px] text-slate-400">
                    {i + 1}
                  </span>
                  <ChannelBadge channel={s.channel} />
                  <span className="flex-1 text-xs text-slate-200">{s.goal}</span>
                  <span className="text-[11px] text-slate-500">
                    {s.dayOffset < 0 ? `${Math.abs(s.dayOffset)}d before due` : `day +${s.dayOffset}`} · {s.tone}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
              <span>{b.touches} touches sent</span>
              <span className="text-emerald-300">{zar(b.recoveredCents)} recovered</span>
            </div>
          </Card>
        ))}
      </div>

      <Card title="How segmentation picks a playbook" subtitle="Deterministic rules, fully auditable">
        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Propensity 72+ and under 21 days", "Friendly nudge — usually self-cures with one WhatsApp"],
            ["Propensity 55-71", "Direct payment request with a PayShap link"],
            ["Propensity 34-54", "Arrangement offer inside policy limits"],
            ["Propensity below 34", "Pre-legal review — packaged for a human, never auto-threatened"],
            ["Balance ≥ R25 000 and 45+ days", "High-value human handoff with a full brief"],
            ["Category = subscription / checkout / dormant / quote", "Dedicated retention cadence rather than collections"],
          ].map(([rule, outcome]) => (
            <div key={rule} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="font-medium text-slate-200">{rule}</p>
              <p className="mt-1 text-slate-400">{outcome}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
