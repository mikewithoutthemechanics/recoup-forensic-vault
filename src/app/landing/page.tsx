import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "Recoup — Revenue recovery vault for South Africa",
  description:
    "The forensic vault that scores every overdue rand, picks a compliant channel, and gets paid via PayShap. POPIA-aware, human-escalated.",
};

// — SVG icons (no emoji, per ui-ux-pro-max) —
function VaultIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <path d="M12 7.5v2M12 14.5v2M7.5 12h2M14.5 12h2" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
      <path d="M9.5 12l2 2 4-4" />
    </svg>
  );
}
function ZapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="relative -mx-4 -my-6 sm:-mx-5 lg:-mx-8 lg:-my-7">
      {/* — Hero — vault door — */}
      <section className="relative overflow-hidden border-b border-line bg-abyss">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70rem_42rem_at_88%_-12%,rgb(56_217_156/0.10),transparent),radial-gradient(55rem_34rem_at_-12%_8%,rgb(124_201_255/0.07),transparent),radial-gradient(38rem_28rem_at_50%_110%,rgb(240_180_85/0.08),transparent)]" />
        <div className="pointer-events-none absolute inset-0 grain opacity-[0.04]" aria-hidden />
        {/* perforated top edge */}
        <div className="perforated absolute inset-x-0 top-0 h-2 opacity-15" aria-hidden />
        <span className="vault-rivet left-3 top-3 hidden lg:block" aria-hidden />
        <span className="vault-rivet right-3 top-3 hidden lg:block" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-5 lg:px-8 lg:py-14">
          {/* nav */}
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-mint to-teal-600 text-sm font-black text-mint-ink shadow-glow">
                R
              </div>
              <span className="font-display text-[15px] font-semibold tracking-tight text-ink">Recoup</span>
              <span className="hidden sm:inline font-mono text-[9px] tracking-[0.16em] text-ink3">RECOVERY OS · ZA · POPIA</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/" className="hidden sm:inline-flex btn btn-quiet btn-sm">
                Open vault →
              </Link>
              <Link href="/landing#pricing" className="btn btn-primary btn-sm">
                See pricing
              </Link>
            </div>
          </nav>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mint">
                <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulse" aria-hidden /> Forensic vault · live on Vercel
              </p>
              <h1 className="mt-4 font-display text-[34px] font-semibold leading-[0.92] tracking-[-0.03em] text-ink sm:text-[42px] lg:text-[48px]">
                Collections on
                <br />
                <span className="bg-gradient-to-r from-mint to-iris bg-clip-text text-transparent">autopilot</span>
                <br />
                humans where it counts.
              </h1>
              <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink2 sm:text-[15px]">
                Recoup scores every overdue rand, picks a <em className="text-ink not-italic underline decoration-mint/30">POPIA-compliant</em> channel, and
                gets paid via <span className="font-mono text-mint">PayShap</span>. Anything sensitive is packaged for Thandi, not a bot.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link href="/" className="btn btn-primary">
                  Enter command centre
                  <span aria-hidden>→</span>
                </Link>
                <Link href="#how" className="btn btn-quiet">
                  See the vault in 90s
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 font-mono text-[11px] text-ink3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel/60 px-2.5 py-1">
                  <ShieldIcon /> Quiet hours + frequency caps
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel/60 px-2.5 py-1">
                  <VaultIcon /> Human escalation above R25k
                </span>
              </div>
              <div className="mt-7 grid max-w-md grid-cols-3 gap-3 border-t border-line pt-5">
                <div>
                  <p className="font-display text-[22px] font-semibold leading-none text-ink">R2.4m</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink3">Recovered 30d</p>
                </div>
                <div>
                  <p className="font-display text-[22px] font-semibold leading-none text-ink">11.2d</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink3">Avg days to cash</p>
                </div>
                <div>
                  <p className="font-display text-[22px] font-semibold leading-none text-ink">37%</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink3">Reply rate</p>
                </div>
              </div>
            </div>

            {/* vault preview card — glass */}
            <div className="relative">
              <div className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-mint/15 via-transparent to-brass/10 blur-xl" aria-hidden />
              <div className="relative rounded-[24px] border border-line bg-panel/70 p-4 shadow-pop backdrop-blur-xl">
                <div className="perforated absolute inset-x-0 top-0 h-2 opacity-20" aria-hidden />
                <span className="vault-rivet left-3 top-3" aria-hidden />
                <span className="vault-rivet right-3 top-3" aria-hidden />
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink3">Live queue · Kopano Group</p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2 py-1 font-mono text-[10px] text-mint">
                    <span className="h-1.5 w-1.5 rounded-full bg-mint animate-ping" aria-hidden /> 20 active
                  </span>
                </div>
                {/* mini table */}
                <div className="mt-4 space-y-1.5">
                  {[
                    { name: "Coastal Freight (Pty) Ltd", inv: "INV-09884", amt: "R124 500", days: "96d", prop: 38, chan: "voice" },
                    { name: "Vuyo's Auto Spares CC", inv: "INV-10231", amt: "R47 800", days: "71d", prop: 62, chan: "email" },
                    { name: "Fatima Patel (Sunridge)", inv: "SCH-2277", amt: "R22 400", days: "70d", prop: 54, chan: "whatsapp" },
                  ].map((r) => (
                    <div key={r.inv} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-display text-[13px] font-medium leading-none text-ink">{r.name}</p>
                        <p className="mt-1 font-mono text-[10px] text-ink3">
                          {r.inv} · <span className="text-brass">{r.amt}</span> · {r.days}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[11px] font-semibold text-ink">{r.prop}</p>
                        <p className="font-mono text-[9px] uppercase tracking-wide text-ink3">{r.chan}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-mint/10 px-3 py-2 ring-1 ring-mint/20">
                  <p className="font-mono text-[11px] text-mint">Next run: PayShap link + Zulu/Afrikaans tone</p>
                  <span className="font-mono text-[10px] text-mint">→</span>
                </div>
                <p className="mt-2 text-center font-mono text-[10px] text-ink3">Demo ledger · 32 invoices · consent-aware</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* — Trust bar — */}
      <section className="border-b border-line bg-panel/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-5 lg:px-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink3">Built for SA schools, clinics, rentals & trade</p>
          <div className="flex flex-wrap gap-2 font-mono text-[11px] text-ink3">
            <span className="rounded-full border border-line bg-raise px-2.5 py-1">PayShap</span>
            <span className="rounded-full border border-line bg-raise px-2.5 py-1">POPIA</span>
            <span className="rounded-full border border-line bg-raise px-2.5 py-1">Africa/Johannesburg</span>
            <span className="rounded-full border border-line bg-raise px-2.5 py-1">ZAR</span>
          </div>
        </div>
      </section>

      {/* — Bento features — */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-5 lg:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mint">The vault does the chasing. Humans do the judgement.</p>
          <h2 className="mt-2 font-display text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">A forensic ledger, not a spam cannon.</h2>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              kicker: "Score",
              title: "Propensity & priority in one pass",
              desc: "Relationship, ageing, broken promises, LTV and replies → a 0–100 propensity and a priority rank. No black box.",
              accent: "mint",
            },
            {
              kicker: "Comply",
              title: "POPIA guardrails before every send",
              desc: "Consent matrix, quiet hours, Sunday block, 3/week cap, 36h spacing — all checked before a byte leaves.",
              accent: "iris",
            },
            {
              kicker: "Collect",
              title: "PayShap-ready in one tap",
              desc: "Secure token, reference, expiry in 7 days. Card link for >R15k. Matched on webhook, closed on over-credit.",
              accent: "brass",
            },
            {
              kicker: "Speak",
              title: "Zulu · Afrikaans · English, correct tone",
              desc: "Warm-professional, empathetic or firm-friendly — chosen by strategy, not a toggle spam.",
              accent: "lilac",
            },
            {
              kicker: "Escalate",
              title: "High-value & disputes never automated",
              desc: "R25k+ or 75d+? Pre-legal review. Dispute/complaint/opt-out? Frozen and routed to a human.",
              accent: "blush",
            },
            {
              kicker: "Audit",
              title: "Every rand, every message, timestamped",
              desc: "Activities log, payment attribution (ai/staff/organic), playbook touches + recovered cents.",
              accent: "slate",
            },
          ].map((f) => (
            <div
              key={f.kicker}
              className="group relative overflow-hidden rounded-2xl border border-line bg-panel/60 p-5 backdrop-blur transition hover:border-line2 hover:bg-panel/80"
            >
              <span className="vault-rivet left-2.5 top-2.5 opacity-40" aria-hidden />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink3">{f.kicker}</p>
              <h3 className="mt-1.5 font-display text-[16px] font-semibold leading-tight text-ink">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink2">{f.desc}</p>
              <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-60" aria-hidden />
            </div>
          ))}
        </div>
      </section>

      {/* — How it works — */}
      <section id="how" className="border-y border-line bg-panel/30">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5 lg:px-8">
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">How the vault runs</h2>
          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {[
              { n: "01", t: "Score the book", d: "Nightly cron scores 12–20 accounts, re-ranks the queue, and refreshes expected recovery (propensity × balance)." },
              { n: "02", t: "Gate then send", d: "Advisory lock owns the queue, checks guardrails, selects channel by consent + replies + failures, composes PayShap message." },
              { n: "03", t: "Listen & learn", d: "Inbound classifier (opt-out/dispute/negotiate/promise) auto-handles or escalates — every outcome logged." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-line bg-raise/60 p-5">
                <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-brass">{s.n}</p>
                <h3 className="mt-2 font-display text-[15px] font-semibold text-ink">{s.t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink2">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* — Playbooks — */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-5 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Playbooks, not prompts</h2>
          <Link href="/playbooks" className="hidden sm:inline-flex font-mono text-[11px] text-mint hover:text-mint2">
            Explore playbooks →
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: "Friendly nudge", desc: "Warm, 3 touches in 8 days", steps: "WA → WA → Email" },
            { name: "Direct request", desc: "Firm-friendly, 4 touches", steps: "WA → SMS → Email → Voice" },
            { name: "Arrangement", desc: "Empathetic, instalments inside policy", steps: "WA → Email → WA" },
            { name: "Subscription dunning", desc: "Payday-timed retries", steps: "Email → WA → SMS" },
          ].map((p) => (
            <div key={p.name} className="rounded-2xl border border-line bg-panel/50 p-4">
              <p className="font-display text-[14px] font-semibold text-ink">{p.name}</p>
              <p className="mt-1 text-xs text-ink3">{p.desc}</p>
              <p className="mt-2 font-mono text-[10px] text-ink2">{p.steps}</p>
            </div>
          ))}
        </div>
      </section>

      {/* — Pricing — */}
      <section id="pricing" className="border-y border-line bg-gradient-to-b from-panel/40 to-abyss">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5 lg:px-8">
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Pay only for recovered rands</h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink2">No seat fees. The vault proves itself on your oldest book.</p>
          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {[
              { name: "Starter", price: "R1 490", sub: "/mo + 4% of recovered", bullets: ["Up to 200 accounts", "PayShap + EFT attribution", "Email + WhatsApp"] },
              { name: "Vault", price: "R4 900", sub: "/mo + 2.5% of recovered", bullets: ["Unlimited accounts", "All channels incl. voice", "Arrangements + disputes"], featured: true },
              { name: "Enterprise", price: "Custom", sub: "For Kopano-scale books", bullets: ["Dedicated vault + SLA", "Sage/Xero sync", "On-prem option"] },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur ${tier.featured ? "border-mint/30 bg-mint/[0.06] shadow-glow" : "border-line bg-panel/60"}`}
              >
                {tier.featured && (
                  <span className="absolute right-3 top-3 rounded-full bg-mint px-2 py-1 font-mono text-[10px] font-semibold text-mint-ink">Most chosen</span>
                )}
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink3">{tier.name}</p>
                <p className="mt-2 font-display text-[28px] font-semibold tracking-tight text-ink">{tier.price}</p>
                <p className="font-mono text-[11px] text-ink3">{tier.sub}</p>
                <ul className="mt-4 space-y-1.5 text-[13px] text-ink2">
                  {tier.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-mint/60" aria-hidden /> {b}
                    </li>
                  ))}
                </ul>
                <Link href="/" className={`mt-5 inline-flex w-full justify-center btn ${tier.featured ? "btn-primary" : "btn-quiet"}`}>
                  Start with Vault
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* — Final CTA — */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-5 lg:px-8">
        <div className="relative overflow-hidden rounded-[24px] border border-mint/20 bg-gradient-to-br from-mint/10 via-panel/60 to-iris/10 p-6 sm:p-8 shadow-pop">
          <div className="perforated absolute inset-x-0 top-0 h-2 opacity-20" aria-hidden />
          <span className="vault-rivet left-3 top-3" aria-hidden />
          <span className="vault-rivet right-3 top-3" aria-hidden />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink sm:text-[26px]">Arm the vault on your live book.</h2>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink2">
                Connect the ledger, keep your tone and guardrails, run one supervised cycle. You stay in control.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href="/" className="btn btn-primary">
                <ZapIcon /> Enter vault
              </Link>
              <Link href="/controls" className="btn btn-quiet">
                View guardrails
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* — Footer — */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:px-8">
          <p className="font-mono text-[11px] text-ink3">© Kopano Group · POPIA · ZAR · Africa/Johannesburg · PayShap ready</p>
          <div className="flex gap-2 font-mono text-[11px] text-ink3">
            <Link href="/api/health" className="hover:text-ink2">
              Health
            </Link>
            <span aria-hidden>·</span>
            <Link href="/reports" className="hover:text-ink2">
              Recovered value
            </Link>
            <span aria-hidden>·</span>
            <a href="https://github.com/mikewithoutthemechanics/recoup-forensic-vault" target="_blank" rel="noreferrer" className="hover:text-ink2">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
