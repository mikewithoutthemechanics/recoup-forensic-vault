import { updatePolicyAction } from "@/app/actions";
import { ConsentMatrix } from "@/components/ConsentMatrix";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { isQuietHours, saParts, type PolicyLike } from "@/lib/ai/compliance";
import { loadPortfolio } from "@/lib/data";
import { zar } from "@/lib/format";

export const dynamic = "force-dynamic";

const field = "w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400/40";
const label = "text-[11px] uppercase tracking-wider text-slate-500";

function Toggle({ name, checked, text }: { name: string; checked: boolean; text: string }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-xs text-slate-300">
      <input type="checkbox" name={name} defaultChecked={checked} className="h-3.5 w-3.5 accent-emerald-500" />
      {text}
    </label>
  );
}

export default async function ControlsPage() {
  const p = await loadPortfolio();
  const policy = p.policy;
  const quiet = isQuietHours(policy as PolicyLike);
  const { hour } = saParts();

  const consentRows = p.customers.map((c) => ({
    customerId: c.id,
    name: c.name,
    contact: c.contactName,
    consents: p.consents.filter((x) => x.customerId === c.id).map((x) => ({ channel: x.channel, status: x.status })),
  }));

  const revoked = p.consents.filter((c) => c.status === "revoked").length;
  const granted = p.consents.filter((c) => c.status === "granted").length;
  const suppressedValue = p.cases
    .filter((c) => c.status === "paused")
    .reduce((s, c) => s + (p.invoices.find((i) => i.id === c.invoiceId)?.balanceCents ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Consent & policy"
        title="The rules the agent cannot cross"
        description="These guardrails are evaluated before every send: quiet hours, frequency caps, per-channel consent. Nothing legal or credit-related happens without a person signing it off."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Right now in SAST"
          value={quiet ? "Quiet hours" : "Sending window"}
          hint={`${String(hour).padStart(2, "0")}:00 · window ${policy.quietHoursEnd}:00–${policy.quietHoursStart}:00`}
          accent={quiet ? "amber" : "emerald"}
        />
        <Stat label="Consents on file" value={`${granted}`} hint={`${revoked} revoked and suppressed`} accent="sky" />
        <Stat label="Value under suppression" value={zar(suppressedValue)} hint="Opted out — humans only" accent="slate" />
        <Stat
          label="Auto-negotiation"
          value={policy.autoNegotiate ? `${policy.maxInstalments} instalments` : "Off"}
          hint={`Minimum deposit ${policy.minDepositPct}%`}
          accent="violet"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Communication policy" subtitle="Applies to every automated touch across the portfolio">
          <form action={updatePolicyAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className={label}>Quiet start</p>
                <input type="number" min={0} max={23} name="quietHoursStart" defaultValue={policy.quietHoursStart} className={field} />
              </div>
              <div>
                <p className={label}>Quiet end</p>
                <input type="number" min={0} max={23} name="quietHoursEnd" defaultValue={policy.quietHoursEnd} className={field} />
              </div>
              <div>
                <p className={label}>Max / week</p>
                <input type="number" min={1} max={10} name="maxContactsPerWeek" defaultValue={policy.maxContactsPerWeek} className={field} />
              </div>
              <div>
                <p className={label}>Min hours apart</p>
                <input type="number" min={1} max={168} name="minHoursBetweenContacts" defaultValue={policy.minHoursBetweenContacts} className={field} />
              </div>
            </div>

            <div>
              <p className={`${label} mb-1.5`}>Channels the agent may use</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Toggle name="allowWhatsapp" checked={policy.allowWhatsapp} text="WhatsApp" />
                <Toggle name="allowSms" checked={policy.allowSms} text="SMS" />
                <Toggle name="allowEmail" checked={policy.allowEmail} text="Email" />
                <Toggle name="allowVoice" checked={policy.allowVoice} text="Voice" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className={label}>Voice min (R)</p>
                <input type="number" name="voiceMinBalanceRands" defaultValue={Math.round(policy.voiceMinBalanceCents / 100)} className={field} />
              </div>
              <div>
                <p className={label}>Escalate above (R)</p>
                <input type="number" name="escalateAboveRands" defaultValue={Math.round(policy.escalateAboveCents / 100)} className={field} />
              </div>
              <div>
                <p className={label}>Escalate after (days)</p>
                <input type="number" name="escalateAfterDays" defaultValue={policy.escalateAfterDays} className={field} />
              </div>
              <div>
                <p className={label}>Max instalments</p>
                <input type="number" min={1} max={12} name="maxInstalments" defaultValue={policy.maxInstalments} className={field} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className={label}>Min deposit %</p>
                <input type="number" min={0} max={100} name="minDepositPct" defaultValue={policy.minDepositPct} className={field} />
              </div>
              <div className="col-span-1">
                <p className={label}>Tone</p>
                <select name="tone" defaultValue={policy.tone} className={field}>
                  <option value="warm-professional">Warm professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="formal">Formal</option>
                  <option value="direct">Direct</option>
                </select>
              </div>
              <div className="col-span-2">
                <p className={label}>Signature</p>
                <input name="signature" defaultValue={policy.signature} className={field} />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Toggle name="contactSundays" checked={policy.contactSundays} text="Contact on Sundays" />
              <Toggle name="autoNegotiate" checked={policy.autoNegotiate} text="Allow auto-negotiation" />
              <Toggle name="legalActionRequiresHuman" checked={policy.legalActionRequiresHuman} text="Legal needs a human" />
            </div>

            <button className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400">
              Save policy
            </button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card title="What the agent will never do" subtitle="Hard-coded product limits, not prompt instructions">
            <ul className="space-y-2 text-xs text-slate-300">
              {[
                "Make a credit decision, extend credit or change a credit limit",
                "Threaten legal action, blacklisting or credit-bureau listing",
                "Add interest, penalties or collection fees to a balance",
                "Contact a customer who has opted out, on any channel",
                "Send outside the configured window or above the frequency cap",
                "Discuss an account with a third party who is not the debtor",
                "Continue collecting on a disputed account before a human resolves it",
              ].map((t) => (
                <li key={t} className="flex gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <span className="text-rose-400">✕</span>
                  {t}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Escalation ladder" subtitle="Who owns what, and when">
            <ol className="space-y-2 text-xs">
              {[
                ["Agent (autonomous)", "Reminders, payment requests, in-policy arrangements, promise tracking"],
                ["Collections lead", `Balances over ${zar(policy.escalateAboveCents)} or ${policy.escalateAfterDays}+ days overdue, out-of-policy terms`],
                ["Billing specialist", "Any dispute, wrong-contact or billing query — automation freezes immediately"],
                ["Manager / legal", "Pre-legal files. The agent assembles the pack; a human decides and signs"],
              ].map(([who, what], i) => (
                <li key={who} className="flex gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] text-slate-400">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-slate-200">{who}</p>
                    <p className="text-slate-400">{what}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300">POPIA consent ledger</Badge>
              <Badge className="border-sky-400/30 bg-sky-400/10 text-sky-300">Full audit trail</Badge>
              <Badge className="border-violet-400/30 bg-violet-400/10 text-violet-300">Human-in-the-loop</Badge>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Consent register" subtitle="Per-customer, per-channel — the source of truth before any send">
        <ConsentMatrix rows={consentRows} />
      </Card>
    </div>
  );
}
