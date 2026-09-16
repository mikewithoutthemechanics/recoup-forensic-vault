"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { searchAccountsAction, type AccountSearchResult } from "@/app/actions";
import { StatusBadge } from "@/components/ui";
import { CATEGORY_META, zar } from "@/lib/format";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const request = ++requestRef.current;
    // Defer setState to avoid cascading renders (react-hooks/set-state-in-effect)
    queueMicrotask(() => setLoading(true));
    const timer = window.setTimeout(async () => {
      try {
        const next = await searchAccountsAction(query);
        if (request === requestRef.current) {
          setResults(next);
          setSelected(0);
        }
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    }, query ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((value) => Math.min(results.length - 1, value + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((value) => Math.max(0, value - 1));
    }
    if (event.key === "Enter" && results[selected]) {
      event.preventDefault();
      setOpen(false);
      router.push(`/accounts/${results[selected].id}`);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-slate-200"
        aria-label="Search accounts"
      >
        <span aria-hidden>⌕</span>
        <span className="hidden sm:inline">Find an account</span>
        <kbd className="hidden rounded border border-white/10 bg-black/20 px-1.5 py-0.5 font-sans text-[9px] text-slate-500 md:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/75 px-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Find an account"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line2 bg-panel shadow-pop">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <span className="text-slate-500" aria-hidden>
                ⌕
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Customer, contact, invoice or segment…"
                className="h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                aria-label="Search accounts"
                aria-controls="account-search-results"
                aria-activedescendant={results[selected] ? `search-result-${results[selected].id}` : undefined}
              />
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
              ) : (
                <button onClick={() => setOpen(false)} className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500">
                  ESC
                </button>
              )}
            </div>

            <div id="account-search-results" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
              {results.map((result, index) => (
                <Link
                  id={`search-result-${result.id}`}
                  role="option"
                  aria-selected={index === selected}
                  key={result.id}
                  href={`/accounts/${result.id}`}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setSelected(index)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                    index === selected ? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/20" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-base" aria-hidden>
                    {CATEGORY_META[result.category]?.icon ?? "🧾"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-100">{result.customerName}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {result.invoiceNumber} · {result.days}d overdue · propensity {result.propensity}
                    </span>
                  </span>
                  <StatusBadge status={result.status} />
                  <span className="w-24 text-right text-sm font-medium tabular-nums text-slate-200">{zar(result.balanceCents)}</span>
                </Link>
              ))}
              {!loading && results.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-slate-500">No accounts match “{query}”.</div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/5 px-4 py-2 text-[10px] text-slate-600">
              <span>↑↓ navigate · ↵ open · esc close</span>
              <Link href="/accounts" onClick={() => setOpen(false)} className="text-emerald-400/80 hover:text-emerald-300">
                View all accounts →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
