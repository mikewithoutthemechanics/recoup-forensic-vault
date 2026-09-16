"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl py-2 pl-4 pr-3 text-[13px] transition-colors duration-150 ${
        active ? "bg-raise/70 text-ink ring-1 ring-line" : "text-ink2 hover:bg-panel2/70 hover:text-ink"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition-colors ${active ? "bg-mint" : "bg-transparent group-hover:bg-line2"}`}
      />
      <span aria-hidden className={`text-[15px] transition-colors ${active ? "text-mint" : "text-ink3 group-hover:text-ink2"}`}>
        {icon}
      </span>
      <span className="flex-1 font-medium tracking-tight">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-blush/20 px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-blush">{badge}</span>
      )}
    </Link>
  );
}
