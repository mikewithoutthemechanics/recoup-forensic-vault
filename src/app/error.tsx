"use client";

import Link from "next/link";
import { useEffect, useId, useMemo } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const fallbackId = useId();
  const requestId = useMemo(() => {
    if (error.digest) return error.digest;
    // Pure fallback — useId is already unique per instance, no impure Date.now
    return `req_${fallbackId.replace(/:/g, "")}`;
  }, [error.digest, fallbackId]);

  useEffect(() => {
    // Structured logging with component stack for observability
    console.error("[Recoup][WorkspaceError] Unhandled workspace error", {
      message: error.message,
      digest: error.digest,
      requestId,
      name: error.name,
      stack: error.stack,
      componentStack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }, [error, requestId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(requestId);
    } catch {
      // clipboard may be unavailable in insecure context — non-fatal
    }
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
      <div className="w-full rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-6 text-center shadow-card">
        <div
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-rose-400/10 text-xl"
          aria-hidden
        >
          ⚠
        </div>
        <h1 className="mt-4 text-lg font-semibold text-white">This workspace could not be loaded</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The error was contained and no collection action was triggered. Retry the data request, or use the
          request reference when contacting support.
        </p>

        <div className="mt-4 rounded-xl border border-white/5 bg-black/30 px-3 py-2.5 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Request reference
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="break-all font-mono text-xs text-slate-300" aria-live="polite">
              {requestId}
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/[0.08]"
              aria-label="Copy request reference"
            >
              Copy
            </button>
          </div>
          {error.digest && error.digest !== requestId && (
            <p className="mt-1 font-mono text-[10px] text-slate-600">Digest: {error.digest}</p>
          )}
          {error.message && (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-500">{error.message}</p>
          )}
        </div>

        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            Retry safely
          </button>
          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.08]"
          >
            Back to command centre
          </Link>
        </div>

        <p className="mt-3 text-[11px] text-slate-600">
          This incident was logged to the browser console with a component stack for diagnosis.
        </p>
      </div>
    </div>
  );
}
