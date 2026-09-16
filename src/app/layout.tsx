import type { Metadata } from "next";
import type { ReactNode } from "react";

import { inArray, sql } from "drizzle-orm";
import Link from "next/link";

import { CommandPalette } from "@/components/CommandPalette";
import { MobileNav } from "@/components/MobileNav";
import { NavLink } from "@/components/NavLink";
import { PulseDot } from "@/components/ui";
import { db } from "@/db";
import { recoveryCases } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recoup — AI revenue recovery",
  description:
    "An AI collections agent for South African businesses: scores overdue accounts, picks the right channel, sends PayShap payment requests and escalates the things a human must handle.",
};

async function attentionCount(): Promise<number> {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recoveryCases)
      .where(inArray(recoveryCases.status, ["escalated", "disputed"]));
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  try {
    await ensureSeeded();
  } catch {
    // The health endpoint surfaces database problems; render the shell regardless.
  }
  const attention = await attentionCount();

  const navGroups = [
    {
      label: "Workspace",
      items: [
        { href: "/", label: "Command centre", icon: "◎" },
        { href: "/accounts", label: "Accounts", icon: "▤" },
        { href: "/inbox", label: "Conversations", icon: "✉", badge: attention },
      ],
    },
    {
      label: "Automation",
      items: [
        { href: "/playbooks", label: "Playbooks", icon: "⚙" },
        { href: "/controls", label: "Consent & policy", icon: "◆" },
        { href: "/reports", label: "Recovered value", icon: "↗" },
      ],
    },
  ];

  return (
    <html lang="en">
      <body className="min-h-screen bg-abyss text-ink antialiased grain relative">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:border border-line2 focus:bg-raise focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-px bg-gradient-to-r from-transparent via-mint/60 to-transparent" aria-hidden />
        <div
          className="pointer-events-none fixed inset-0 bg-[radial-gradient(70rem_42rem_at_88%_-12%,rgb(56_217_156/0.09),transparent),radial-gradient(55rem_34rem_at_-12%_8%,rgb(124_201_255/0.07),transparent)]"
          aria-hidden
        />

        <div className="relative flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col border-r border-line bg-panel/40 p-4 backdrop-blur lg:flex relative overflow-hidden">
            <span className="vault-rivet left-2 top-2" aria-hidden />
            <span className="vault-rivet right-2 top-2" aria-hidden />
            <span className="vault-rivet left-2 bottom-2" aria-hidden />
            <span className="vault-rivet right-2 bottom-2" aria-hidden />
            <div className="perforated h-2 opacity-40" aria-hidden />
            <Link href="/" className="flex items-center gap-2.5 px-2 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-mint to-teal-600 text-base font-black text-mint-ink shadow-glow">
                R
              </div>
              <div>
                <p className="font-display text-[17px] font-semibold tracking-tight text-ink">Recoup</p>
                <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-ink3">RECOVERY OS · ZA</p>
              </div>
            </Link>

            <nav className="mt-3 flex-1 space-y-5">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink3/70">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink key={item.href} {...item} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-auto space-y-3 px-1 pb-1">
              <div className="rounded-2xl border border-line bg-panel/60 p-3.5">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                  <PulseDot /> Guardrails active
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink3">
                  Consent, quiet hours, frequency caps and human escalation are verified before any message leaves.
                </p>
              </div>
              <p className="px-2 text-[10px] tracking-wide text-ink3/70">Kopano Group · ZAR · Africa/Johannesburg</p>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-20 border-b border-line bg-abyss/80 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5 lg:px-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-mint to-teal-600 text-sm font-black text-mint-ink lg:hidden">
                    R
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold tracking-tight text-ink">Kopano Group</p>
                    <p className="text-[10.5px] text-ink3">Multi-entity receivables · trade, schools, clinics, rentals, SaaS</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CommandPalette />
                  <span className="hidden items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 text-[10.5px] font-medium text-mint sm:inline-flex">
                    <PulseDot /> Agent armed
                  </span>
                  <span className="hidden rounded-full border border-line bg-panel/70 px-2.5 py-1 text-[10.5px] text-ink2 md:inline-flex">
                    PayShap ready
                  </span>
                </div>
              </div>
            </header>

            <main id="main" className="px-4 py-6 pb-24 sm:px-5 lg:px-8 lg:py-7 lg:pb-10">
              {children}
            </main>
          </div>
          <MobileNav attention={attention} />
        </div>
      </body>
    </html>
  );
}
