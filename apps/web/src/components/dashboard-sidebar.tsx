import {
  BarChart3,
  Boxes,
  Code2,
  FileText,
  LayoutDashboard,
  Settings2,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "./logo";
import { SignOutButton } from "./sign-out-button";

const primary = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/content", label: "Content library", icon: Boxes },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const manage = [
  { href: "/team", label: "Authors & team", icon: Users2 },
  { href: "/integrate", label: "Integrate", icon: Code2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function DashboardSidebar({ userName, blogName }: { userName: string; blogName: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#dedfd9] bg-[#f8f7f2] px-4 py-5 lg:flex">
      <Link href="/dashboard" className="px-2">
        <Logo className="text-lg" />
      </Link>

      <div className="mt-7 rounded-xl border border-[#dedfd9] bg-white p-2.5 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-[#fee9df] text-xs font-bold text-[#b84027]">F</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{blogName}</p>
            <p className="text-[10px] text-[#7b8589]">Primary publication</p>
          </div>
          <span className="text-xs text-[#8a9397]">⌄</span>
        </div>
      </div>

      <nav className="mt-6 space-y-1">
        {primary.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-white ${index === 0 ? "bg-white text-[#172329] shadow-sm" : "text-[#687279]"}`}
          >
            <item.icon className="size-4" strokeWidth={1.9} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa1a4]">Workspace</div>
      <nav className="mt-2 space-y-1">
        {manage.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#687279] transition hover:bg-white hover:text-[#172329]">
            <item.icon className="size-4" strokeWidth={1.9} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t border-[#dedfd9] pt-4">
        <div className="mb-2 flex items-center gap-2.5 px-2">
          <div className="grid size-8 place-items-center rounded-full bg-[#20343a] text-xs font-semibold text-white">{userName.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{userName}</p>
            <p className="text-[10px] text-[#8a9397]">Owner</p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
