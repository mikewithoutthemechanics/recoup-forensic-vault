"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { resetDemoAction, runCycleAction, simulateInboundAction } from "@/app/actions";

type LogLine = { tone: "ok" | "warn" | "info"; text: string };
type Operation = "cycle" | "override" | "simulate" | "reset" | null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed";
}

export function AgentConsole() {
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<Operation>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [open, setOpen] = useState(false);
  const [quietBlocked, setQuietBlocked] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const router = useRouter();

  const run = (override = false) => {
    setOperation(override ? "override" : "cycle");
    setOpen(true);
    setLines([{ tone: "info", text: "Claiming the queue · scoring accounts · applying consent and policy checks…" }]);
    startTransition(async () => {
      try {
        const result = await runCycleAction(override);
        setQuietBlocked(result.log.some((line) => line.detail.toLowerCase().includes("quiet hours")));
        const summary: LogLine = result.busy
          ? { tone: "warn", text: "Another worker already owns the recovery queue. No duplicate cycle was started." }
          : {
              tone: "ok",
              text: `${override ? "Supervised override" : "Cycle complete"} · ${result.evaluated} scored · ${result.sent} contacted · ${result.escalated} escalated · ${result.held} held · ${result.paymentRequests} new payment links`,
            };
        setLines([
          summary,
          ...result.log.map((line) => ({
            tone: (line.outcome.startsWith("Sent") ? "ok" : ["Escalated", "Busy"].includes(line.outcome) ? "warn" : "info") as LogLine["tone"],
            text: `${line.customer} — ${line.outcome}: ${line.detail}`,
          })),
        ]);
        router.refresh();
      } catch (error) {
        setLines([{ tone: "warn", text: `Cycle failed safely: ${errorMessage(error)}. No retry was sent automatically.` }]);
      } finally {
        setOperation(null);
      }
    });
  };

  const simulate = () => {
    setOperation("simulate");
    setOpen(true);
    setLines([{ tone: "info", text: "Generating inbound events and running intent classification…" }]);
    startTransition(async () => {
      try {
        const result = await simulateInboundAction();
        setLines(
          result.length
            ? result.map((item) => ({ tone: "info" as const, text: `Case #${item.caseId} replied (${item.intent}) → ${item.action}` }))
            : [{ tone: "warn", text: "No recently contacted accounts can reply yet — run a recovery cycle first." }],
        );
        router.refresh();
      } catch (error) {
        setLines([{ tone: "warn", text: `Simulation failed: ${errorMessage(error)}` }]);
      } finally {
        setOperation(null);
      }
    });
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 5_000);
      return;
    }
    setOperation("reset");
    setConfirmReset(false);
    setOpen(true);
    setLines([{ tone: "info", text: "Restoring the curated demo portfolio…" }]);
    startTransition(async () => {
      try {
        await resetDemoAction();
        setLines([{ tone: "ok", text: "Demo portfolio reset to its opening state." }]);
        router.refresh();
      } catch (error) {
        setLines([{ tone: "warn", text: `Reset failed: ${errorMessage(error)}` }]);
      } finally {
        setOperation(null);
      }
    });
  };

  const disabled = pending || operation !== null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => run(false)} disabled={disabled} className="btn btn-primary">
          {operation === "cycle" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-mint-ink/30 border-t-mint-ink" />
          ) : (
            <span aria-hidden>⚡</span>
          )}
          {operation === "cycle" ? "Running controls…" : "Run AI recovery cycle"}
        </button>

        {quietBlocked && (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={disabled}
            title="Runs outside the sending window. Consent, opt-outs and frequency caps still apply; the override is audited."
            className="btn btn-warn"
          >
            <span aria-hidden>🔓</span> {operation === "override" ? "Running override…" : "Supervised override"}
          </button>
        )}

        <button type="button" onClick={simulate} disabled={disabled} className="btn btn-quiet">
          <span aria-hidden>💬</span> {operation === "simulate" ? "Classifying…" : "Simulate customer replies"}
        </button>

        <button
          type="button"
          onClick={reset}
          disabled={disabled}
          className={`btn btn-sm ${confirmReset ? "btn-danger" : "btn-ghost"}`}
        >
          {operation === "reset" ? "Resetting…" : confirmReset ? "Confirm reset" : "Reset demo"}
        </button>
      </div>

      {open && lines.length > 0 && (
        <div
          className="overflow-hidden rounded-xl border border-line bg-black/40 font-mono text-[11px] leading-relaxed shadow-pop"
          aria-live="polite"
          aria-busy={disabled}
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-ink3">
            <span className="flex items-center gap-2">
              <span className="flex gap-1" aria-hidden>
                <span className="h-2 w-2 rounded-full bg-blush/70" />
                <span className="h-2 w-2 rounded-full bg-brass/70" />
                <span className="h-2 w-2 rounded-full bg-mint/70" />
              </span>
              agent console
              {disabled && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="hover:text-ink">
              close
            </button>
          </div>
          <ul className="max-h-52 space-y-1 overflow-y-auto p-3">
            {lines.map((line, index) => (
              <li
                key={`${index}-${line.text}`}
                className={line.tone === "ok" ? "text-mint" : line.tone === "warn" ? "text-brass" : "text-ink2"}
              >
                <span className="text-ink3/50">›</span> {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
