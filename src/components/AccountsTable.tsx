"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ChannelBadge, ScoreBar, StatusBadge } from "@/components/ui";
import type { CaseRow } from "@/lib/data";
import { CATEGORY_META, agingBucket, formatDate, zar } from "@/lib/format";

const STATUS_FILTERS = [
  { key: "active", label: "Active" },
  { key: "all", label: "All" },
  { key: "escalated", label: "Escalated" },
  { key: "disputed", label: "Disputed" },
  { key: "promise_to_pay", label: "Promises" },
  { key: "arrangement", label: "Arrangements" },
  { key: "paused", label: "Suppressed" },
  { key: "recovered", label: "Recovered" },
];

const SORTS = [
  { key: "priority", label: "Priority" },
  { key: "balance", label: "Balance" },
  { key: "age", label: "Days overdue" },
  { key: "propensity", label: "Propensity" },
];

export function AccountsTable({ rows }: { rows: CaseRow[] }) {
  const [status, setStatus] = useState("active");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("priority");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))), [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (status === "active") out = out.filter((r) => !["recovered", "closed"].includes(r.status));
    else if (status !== "all") out = out.filter((r) => r.status === status);
    if (category !== "all") out = out.filter((r) => r.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (r) =>
          r.customerName.toLowerCase().includes(q) ||
          r.invoiceNumber.toLowerCase().includes(q) ||
          r.segment.toLowerCase().includes(q),
      );
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      if (sort === "balance") return b.balanceCents - a.balanceCents;
      if (sort === "age") return b.days - a.days;
      if (sort === "propensity") return b.propensity - a.propensity;
      return b.priority - a.priority;
    });
    return sorted;
  }, [rows, status, category, sort, query]);

  const totals = useMemo(
    () => ({
      value: filtered.reduce((s, r) => s + r.balanceCents, 0),
      expected: filtered.reduce((s, r) => s + Math.round((r.balanceCents * r.propensity) / 100), 0),
    }),
    [filtered],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="seg max-w-full overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              data-active={status === f.key}
              onClick={() => setStatus(f.key)}
              className="seg-item whitespace-nowrap"
            >
              {f.label}
            </button>
          ))}
        </div>

        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input" aria-label="Filter by receivable type">
          <option value="all">All receivable types</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c]?.label ?? c}
            </option>
          ))}
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value)} className="input" aria-label="Sort accounts">
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              Sort: {s.label}
            </option>
          ))}
        </select>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer, invoice or segment…"
          className="input min-w-[14rem] flex-1"
          aria-label="Search accounts"
        />
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length} accounts · {zar(totals.value)} outstanding · AI expects {zar(totals.expected)} recoverable
      </p>

      <div className="grid gap-2 md:hidden">
        {filtered.map((row) => (
          <Link
            key={row.id}
            href={`/accounts/${row.id}`}
            className="lift rounded-2xl border border-line bg-panel/70 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">{row.customerName}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {CATEGORY_META[row.category]?.icon} {row.invoiceNumber} · {agingBucket(row.days)} days
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-white">{zar(row.balanceCents)}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                <ChannelBadge channel={row.nextChannel} />
              </div>
              <ScoreBar value={row.propensity} risk={row.riskTier} />
            </div>
            <p className="mt-2 truncate text-[11px] text-slate-400">{row.holdReason ?? row.nextAction ?? "No next action"}</p>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
            No accounts match that filter.
          </p>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-panel/60 shadow-card md:block">
        <table className="w-full min-w-[62rem] text-sm">
          <thead className="border-b border-line bg-panel2/70 text-left text-[10px] uppercase tracking-[0.13em] text-ink3">
            <tr>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Balance</th>
              <th className="px-3 py-2.5 font-medium">Bucket</th>
              <th className="px-3 py-2.5 font-medium">Propensity</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Next action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-panel2/60">
                <td className="max-w-[18rem] px-4 py-3">
                  <Link href={`/accounts/${r.id}`} className="block">
                    <p className="truncate font-medium text-slate-100">{r.customerName}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {r.invoiceNumber} · {r.segment}
                      {r.language !== "en" && <span className="ml-1 uppercase text-slate-600">{r.language}</span>}
                    </p>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">
                  {CATEGORY_META[r.category]?.icon} {CATEGORY_META[r.category]?.label ?? r.category}
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums text-slate-100">{zar(r.balanceCents)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">
                  {agingBucket(r.days)} <span className="text-slate-600">· due {formatDate(r.dueAt)}</span>
                </td>
                <td className="px-3 py-3">
                  <ScoreBar value={r.propensity} risk={r.riskTier} />
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="max-w-[18rem] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <ChannelBadge channel={r.nextChannel} />
                    <span className="truncate text-[11px] text-slate-400">{r.holdReason ?? r.nextAction ?? "—"}</span>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  No accounts match that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
