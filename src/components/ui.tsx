import type { ReactNode } from "react";

import { CHANNEL_META, RISK_META, STATUS_META } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Page header                                                          */
/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-mint/90">
          <span className="h-px w-5 bg-mint/60" aria-hidden />
          {eyebrow}
        </p>
        <h1 className="mt-2 font-display text-[28px] font-semibold leading-[0.95] tracking-[-0.02em] text-ink sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-ink2">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                             */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={`relative overflow-hidden rounded-2xl border border-line bg-panel/75 shadow-card backdrop-blur-sm ${className}`}>
      <span className="vault-rivet left-2.5 top-2.5 hidden sm:block" aria-hidden />
      <span className="vault-rivet right-2.5 top-2.5 hidden sm:block" aria-hidden />
      <div className="perforated absolute inset-x-0 top-0 h-2 opacity-20" aria-hidden />
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="truncate font-display text-[13px] font-semibold tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-ink3">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Metrics                                                              */
/* ------------------------------------------------------------------ */

const STAT_ACCENTS: Record<string, { line: string; chip: string }> = {
  emerald: { line: "via-mint/60", chip: "bg-mint/10 text-mint ring-mint/25" },
  sky: { line: "via-iris/60", chip: "bg-iris/10 text-iris ring-iris/25" },
  amber: { line: "via-brass/60", chip: "bg-brass/10 text-brass ring-brass/25" },
  violet: { line: "via-lilac/60", chip: "bg-lilac/10 text-lilac ring-lilac/25" },
  rose: { line: "via-blush/60", chip: "bg-blush/10 text-blush ring-blush/25" },
  slate: { line: "via-white/20", chip: "bg-white/[0.05] text-ink2 ring-white/10" },
};

export function Stat({
  label,
  value,
  hint,
  accent = "emerald",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: keyof typeof STAT_ACCENTS;
  icon?: ReactNode;
}) {
  const a = STAT_ACCENTS[accent] ?? STAT_ACCENTS.emerald;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-panel/75 p-4 shadow-card transition-all duration-200 hover:border-line2 hover:shadow-glow">
      <span className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${a.line} to-transparent`} aria-hidden />
      <span className="vault-rivet left-2 top-2 opacity-60" aria-hidden />
      <span className="vault-rivet right-2 top-2 opacity-60" aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink3">{label}</p>
        {icon && <span className={`icon-chip ${a.chip}`}>{icon}</span>}
      </div>
      <p className="mt-2.5 font-display text-[24px] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink3">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chips & badges                                                       */
/* ------------------------------------------------------------------ */

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "bg-white/[0.05] text-ink2 border-line2" };
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

export function ChannelBadge({ channel }: { channel: string | null | undefined }) {
  if (!channel) return <Badge className="border-line bg-white/[0.04] text-ink3">none</Badge>;
  const meta = CHANNEL_META[channel] ?? { label: channel, icon: "•", color: "bg-white/[0.05] text-ink2 border-line2" };
  return (
    <Badge className={meta.color}>
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </Badge>
  );
}

export function PulseDot({ tone = "mint" }: { tone?: "mint" | "brass" | "blush" | "iris" }) {
  const colors = { mint: "bg-mint", brass: "bg-brass", blush: "bg-blush", iris: "bg-iris" };
  return (
    <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colors[tone]} opacity-40`} />
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${colors[tone]}`} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Scores & bars                                                        */
/* ------------------------------------------------------------------ */

export function ScoreBar({ value, risk }: { value: number; risk?: string }) {
  const color = value >= 72 ? "bg-mint" : value >= 52 ? "bg-iris" : value >= 32 ? "bg-brass" : "bg-blush";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.07]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label="Propensity to pay">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(4, value)}%` }} />
      </div>
      <span className={`text-[11px] font-semibold tabular-nums ${risk ? (RISK_META[risk] ?? "text-ink2") : "text-ink2"}`}>{value}</span>
    </div>
  );
}

export function BarRow({
  label,
  value,
  max,
  caption,
  color = "bg-mint/80",
}: {
  label: string;
  value: number;
  max: number;
  caption: string;
  color?: string;
}) {
  const pct = max <= 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="grid grid-cols-[5.25rem_1fr_auto] items-center gap-3 py-1.5">
      <span className="truncate text-xs text-ink3">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-ink2">{caption}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line2 bg-panel/40 px-4 py-6 text-center text-[13px] text-ink3">{children}</p>
  );
}
