"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { togglePlaybookAction } from "@/app/actions";

export function PlaybookToggle({ id, active }: { id: number; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await togglePlaybookAction(id, !active);
          router.refresh();
        })
      }
      className={`relative h-6 w-11 rounded-full border transition ${
        active ? "border-emerald-400/40 bg-emerald-500/30" : "border-white/10 bg-white/5"
      } disabled:opacity-50`}
      aria-label={active ? "Disable playbook" : "Enable playbook"}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${
          active ? "left-[1.4rem] bg-emerald-300" : "left-0.5 bg-slate-400"
        }`}
        style={{ height: "1.1rem", width: "1.1rem" }}
      />
    </button>
  );
}
