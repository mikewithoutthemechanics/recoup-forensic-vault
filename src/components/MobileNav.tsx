"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "◎" },
  { href: "/accounts", label: "Accounts", icon: "▤" },
  { href: "/inbox", label: "Inbox", icon: "✉" },
  { href: "/playbooks", label: "Flows", icon: "⚙" },
  { href: "/controls", label: "Policy", icon: "🛡" },
  { href: "/reports", label: "Value", icon: "↗" },
];

export function MobileNav({ attention }: { attention: number }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-white/10 bg-[#070b14]/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"
      aria-label="Primary navigation"
    >
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 text-[9px] font-medium transition ${
              active ? "bg-emerald-500/10 text-emerald-300" : "text-slate-500 active:bg-white/5 active:text-slate-200"
            }`}
          >
            <span className="text-base leading-none" aria-hidden>
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
            {item.href === "/inbox" && attention > 0 && (
              <span className="absolute right-[20%] top-0 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] leading-4 text-white">
                {attention > 9 ? "9+" : attention}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
