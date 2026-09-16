"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  draftMessageAction,
  escalateAction,
  inboundReplyAction,
  markPaidAction,
  offerArrangementAction,
  optOutAction,
  resolveDisputeAction,
  sendManualMessageAction,
} from "@/app/actions";
import { Badge, Card, ChannelBadge } from "@/components/ui";

type Draft = Awaited<ReturnType<typeof draftMessageAction>>;

const btn = "btn btn-quiet btn-sm";
const primary = "btn btn-primary btn-sm";

export function CaseWorkspace({
  caseId,
  status,
  balanceRands,
  maxInstalments,
}: {
  caseId: number;
  status: string;
  balanceRands: number;
  maxInstalments: number;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [inboundResult, setInboundResult] = useState<{ intent: string; action: string; autoReply: string | null; confidence: number } | null>(null);
  const [instalments, setInstalments] = useState(3);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const router = useRouter();

  const run = (fn: () => Promise<void>, message?: string) =>
    startTransition(async () => {
      await fn();
      if (message) setFlash(message);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Card title="Next best action" subtitle="Draft is generated from the score, consent record and org policy">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              className={primary}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const d = await draftMessageAction(caseId);
                  setDraft(d);
                  setBody(d.body);
                  setFlash(null);
                })
              }
            >
              {pending && !draft ? "Thinking…" : "✨ Generate next message"}
            </button>
            <button
              className={btn}
              disabled={pending || !body}
              onClick={() =>
                run(async () => {
                  await sendManualMessageAction(caseId, draft?.channel ?? "whatsapp", body);
                  setDraft(null);
                  setBody("");
                }, "Message sent and logged on the case.")
              }
            >
              Send now
            </button>
          </div>

          {draft && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/60 p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <ChannelBadge channel={draft.channel} />
                <Badge className="border-violet-500/30 bg-violet-500/15 text-violet-300">{draft.strategy}</Badge>
                <Badge className="border-sky-500/30 bg-sky-500/15 text-sky-300">propensity {draft.propensity}</Badge>
                {draft.refinedByLlm && (
                  <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">LLM polished</Badge>
                )}
              </div>
              {draft.subject && <p className="text-xs text-slate-300">Subject: {draft.subject}</p>}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                className="w-full rounded-lg border border-white/10 bg-slate-900 p-3 text-xs leading-relaxed text-slate-200 outline-none focus:border-emerald-400/40"
              />
              {draft.blocked.length > 0 && (
                <p className="text-[11px] text-amber-300/80">
                  Blocked channels: {draft.blocked.map((b) => `${b.channel} (${b.reason})`).join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title="Case actions" subtitle="Everything an agent or a human can do from here">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={pending} onClick={() => run(() => markPaidAction(caseId), "Payment recorded — case settled.")}>
              💰 Mark settled ({balanceRands.toLocaleString("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 })})
            </button>
            <button
              className={btn}
              disabled={pending}
              onClick={() => run(() => markPaidAction(caseId, Math.round(balanceRands / 2)), "Part payment recorded.")}
            >
              Record part payment (50%)
            </button>
            <button className={btn} disabled={pending} onClick={() => run(() => optOutAction(caseId), "Consent revoked, outreach suppressed.")}>
              🚫 Opt out on all channels
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <span className="text-xs text-slate-400">Offer arrangement</span>
            <select
              value={instalments}
              onChange={(e) => setInstalments(Number(e.target.value))}
              className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} instalments
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500">policy max {maxInstalments}</span>
            <button
              className={btn}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const p = await offerArrangementAction(caseId, instalments);
                  setFlash(
                    p.approved
                      ? `Arrangement activated: ${p.instalments} × R${(p.instalmentCents / 100).toLocaleString("en-ZA")} ${p.cadence}.`
                      : `Sent for human approval: ${p.reason}`,
                  );
                  router.refresh();
                })
              }
            >
              Propose
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason / note for the file…"
              className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600"
            />
            <button
              className={btn}
              disabled={pending}
              onClick={() => run(() => escalateAction(caseId, note || "Manually escalated by staff"), "Escalated to the collections lead.")}
            >
              ⚠ Escalate to human
            </button>
            {status === "disputed" && (
              <>
                <button
                  className={btn}
                  disabled={pending}
                  onClick={() => run(() => resolveDisputeAction(caseId, "valid", note || "Dispute upheld"), "Credit note issued, case closed.")}
                >
                  Uphold dispute (credit note)
                </button>
                <button
                  className={btn}
                  disabled={pending}
                  onClick={() =>
                    run(() => resolveDisputeAction(caseId, "invalid", note || "Dispute not upheld"), "Dispute closed, cadence resumed.")
                  }
                >
                  Reject & resume
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card title="Simulate an inbound reply" subtitle="Test how the agent classifies and responds — WhatsApp, SMS, email or voice transcript">
        <div className="space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="e.g. Can I pay this in 3 instalments? Cash flow is tight this month."
            className="w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-400/40"
          />
          <div className="flex flex-wrap gap-2">
            {["I'll pay on Friday when I get paid", "This invoice is wrong, we cancelled that order", "Can I pay in 3 instalments?", "STOP"].map(
              (s) => (
                <button key={s} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-100" onClick={() => setReply(s)}>
                  {s}
                </button>
              ),
            )}
          </div>
          <button
            className={primary}
            disabled={pending || !reply.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await inboundReplyAction(caseId, reply);
                setInboundResult(res);
                setReply("");
                router.refresh();
              })
            }
          >
            Receive message
          </button>
          {inboundResult && (
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
              <p>
                <span className="text-slate-500">Intent:</span>{" "}
                <span className="font-medium text-emerald-300">{inboundResult.intent.replace("_", " ")}</span>{" "}
                <span className="text-slate-500">({Math.round(inboundResult.confidence * 100)}% confidence)</span>
              </p>
              <p className="mt-1">
                <span className="text-slate-500">Action taken:</span> {inboundResult.action}
              </p>
              {inboundResult.autoReply && (
                <p className="mt-2 rounded-lg bg-emerald-500/10 p-2 text-emerald-200">{inboundResult.autoReply}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      {flash && <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">{flash}</p>}
    </div>
  );
}
