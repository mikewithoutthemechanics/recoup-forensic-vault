import Link from "next/link";

import { AgentConsole } from "@/components/AgentConsole";
import { Badge, Card, ChannelBadge, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { getInbox } from "@/lib/data";
import { INTENT_META, type Intent } from "@/lib/ai/inbound";
import { formatDate, relativeTime, zar } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { rows, recentInbound } = await getInbox();

  const needsHuman = rows.filter((r) => ["escalated", "disputed"].includes(r.status));
  const promises = rows.filter((r) => r.status === "promise_to_pay");
  const arrangementCases = rows.filter((r) => r.status === "arrangement");
  const suppressed = rows.filter((r) => r.status === "paused");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Conversations"
        title="Replies that need judgement, not scripts"
        description="Inbound replies are classified the moment they land. Disputes, hardship and complaints freeze automation and land here — everything else keeps moving on its own."
      >
        <AgentConsole />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Waiting on a human" value={`${needsHuman.length}`} hint={zar(needsHuman.reduce((s, r) => s + r.balanceCents, 0))} accent="rose" />
        <Stat label="Promises to pay" value={`${promises.length}`} hint={zar(promises.reduce((s, r) => s + r.balanceCents, 0))} accent="violet" />
        <Stat label="Live arrangements" value={`${arrangementCases.length}`} hint={zar(arrangementCases.reduce((s, r) => s + r.balanceCents, 0))} accent="sky" />
        <Stat label="Suppressed (opt-out)" value={`${suppressed.length}`} hint="No outreach on any channel" accent="slate" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Needs a human" subtitle="Automation is frozen on these accounts">
          {needsHuman.length === 0 ? (
            <Empty>Clear. Nothing is waiting on a person.</Empty>
          ) : (
            <ul className="space-y-2">
              {needsHuman.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/accounts/${r.id}`}
                    className="block rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100">{r.customerName}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {r.invoiceNumber} · {r.days}d overdue · {r.assignedTo ?? "unassigned"}
                        </p>
                        <p className="mt-1 text-[11px] text-amber-300/80">{r.holdReason ?? r.aiSummary}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge status={r.status} />
                        <p className="mt-1 text-sm tabular-nums text-slate-200">{zar(r.balanceCents)}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent inbound" subtitle="Classified intent drives the next step automatically">
          {recentInbound.length === 0 ? (
            <Empty>No replies yet — run a cycle, then simulate customer replies.</Empty>
          ) : (
            <ul className="space-y-2">
              {recentInbound.map(({ m, cust }) => (
                <li key={m.id}>
                  <Link
                    href={`/accounts/${m.caseId}`}
                    className="block rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:bg-white/[0.05]"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <ChannelBadge channel={m.channel} />
                      <span className="text-slate-300">{cust.contactName}</span>
                      <span>· {relativeTime(m.createdAt)}</span>
                      {m.intent && (
                        <Badge className={INTENT_META[m.intent as Intent]?.className ?? "border-white/10 bg-white/5 text-slate-300"}>
                          {INTENT_META[m.intent as Intent]?.label ?? m.intent}
                        </Badge>
                      )}
                      {m.sentiment === "negative" && (
                        <Badge className="border-rose-500/30 bg-rose-500/15 text-rose-300">negative tone</Badge>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs text-slate-200">{m.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Promises to pay" subtitle="Cadence paused until the promised date, then auto-confirmed">
          {promises.length === 0 ? (
            <Empty>No open promises.</Empty>
          ) : (
            <ul className="space-y-2 text-xs">
              {promises.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
                  <Link href={`/accounts/${r.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-slate-100">{r.customerName}</p>
                    <p className="text-[11px] text-slate-500">{r.nextAction}</p>
                  </Link>
                  <span className="tabular-nums text-slate-200">{zar(r.balanceCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Suppression list" subtitle="Opted out — statements only, never automated chasing">
          {suppressed.length === 0 ? (
            <Empty>Nobody has opted out.</Empty>
          ) : (
            <ul className="space-y-2 text-xs">
              {suppressed.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
                  <Link href={`/accounts/${r.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-slate-100">{r.customerName}</p>
                    <p className="text-[11px] text-slate-500">
                      {r.holdReason} · last contact {r.lastContactAt ? formatDate(r.lastContactAt) : "—"}
                    </p>
                  </Link>
                  <span className="tabular-nums text-slate-400">{zar(r.balanceCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
