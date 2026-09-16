export const SA_TIMEZONE = "Africa/Johannesburg";

export function zar(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function zarCompact(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  if (Math.abs(value) >= 1_000_000) return `R${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `R${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return `R${value.toFixed(0)}`;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function daysOverdue(dueAt: Date, now = new Date()): number {
  return Math.max(0, daysBetween(new Date(dueAt), now));
}

export function agingBucket(days: number): string {
  if (days <= 0) return "Current";
  if (days <= 15) return "1-15";
  if (days <= 30) return "16-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: SA_TIMEZONE,
  }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SA_TIMEZONE,
  }).format(d);
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 60) return mins <= 0 ? "just now" : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(d);
}

export const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: "💬", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  sms: { label: "SMS", icon: "📱", color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  email: { label: "Email", icon: "✉️", color: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  voice: { label: "Voice", icon: "📞", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

export const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  invoice: { label: "Unpaid invoice", icon: "🧾" },
  subscription: { label: "Subscription failure", icon: "🔁" },
  school_fee: { label: "School fees", icon: "🎒" },
  rental: { label: "Rental arrears", icon: "🏠" },
  clinic: { label: "Clinic account", icon: "🩺" },
  quote: { label: "Quote follow-up", icon: "📄" },
  checkout: { label: "Abandoned checkout", icon: "🛒" },
  dormant: { label: "Dormant reactivation", icon: "🌱" },
};

export const STATUS_META: Record<string, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  engaging: { label: "Engaging", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  promise_to_pay: { label: "Promise to pay", className: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  arrangement: { label: "Arrangement", className: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  disputed: { label: "Disputed", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  escalated: { label: "Escalated", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  recovered: { label: "Recovered", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  paused: { label: "Paused / opted out", className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  closed: { label: "Closed", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

export const RISK_META: Record<string, string> = {
  low: "text-emerald-300",
  medium: "text-sky-300",
  high: "text-amber-300",
  critical: "text-rose-300",
};
