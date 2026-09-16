"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setConsentAction } from "@/app/actions";
import { CHANNEL_META } from "@/lib/format";

type Row = {
  customerId: number;
  name: string;
  contact: string;
  consents: { channel: string; status: string }[];
};

export function ConsentMatrix({ rows }: { rows: Row[] }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const router = useRouter();
  const channels = ["whatsapp", "sms", "email", "voice"];

  const visible = rows.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search customers…"
        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-400/40"
      />
      <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/5">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              {channels.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {CHANNEL_META[c].icon} {CHANNEL_META[c].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visible.map((r) => (
              <tr key={r.customerId} className="hover:bg-white/[0.02]">
                <td className="max-w-[16rem] px-3 py-2">
                  <p className="truncate text-slate-200">{r.name}</p>
                  <p className="truncate text-[10px] text-slate-500">{r.contact}</p>
                </td>
                {channels.map((ch) => {
                  const status = r.consents.find((c) => c.channel === ch)?.status ?? "denied";
                  const granted = status === "granted";
                  return (
                    <td key={ch} className="px-3 py-2">
                      <button
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await setConsentAction(r.customerId, ch, granted ? "revoked" : "granted");
                            router.refresh();
                          })
                        }
                        className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition disabled:opacity-50 ${
                          granted
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                            : status === "revoked"
                              ? "border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20"
                              : "border-white/10 bg-white/5 text-slate-500 hover:bg-white/10"
                        }`}
                      >
                        {status}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Click a cell to grant or revoke. Revoking suppresses that channel instantly — the agent re-reads consent before
        every single send.
      </p>
    </div>
  );
}
