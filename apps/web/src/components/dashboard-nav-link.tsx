"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function DashboardNavLink({
  href,
  children,
  compact = false,
  collapsed = false,
  label,
}: {
  href: string;
  children: ReactNode;
  compact?: boolean;
  collapsed?: boolean;
  label?: string;
}) {
  const pathname = usePathname();
  const active =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const stateClass = active
    ? "bg-white text-[#172329] shadow-sm"
    : "text-[#687279] hover:bg-white hover:text-[#172329]";

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={
        compact
          ? `rounded-lg px-3 py-2.5 text-xs font-semibold hover:transition-colors ${stateClass}`
          : collapsed
            ? `flex items-center justify-center rounded-xl px-0 py-2.5 text-sm font-medium hover:transition-colors ${stateClass}`
            : `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:transition-colors ${stateClass}`
      }
    >
      {children}
    </Link>
  );
}
