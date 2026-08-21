import {
  BarChart3,
  Boxes,
  Code2,
  FileText,
  History,
  LayoutDashboard,
  Settings2,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { hasPermission } from "@prosewire/core";
import { switchPublication, switchWorkspace } from "@/server/actions";
import type { DashboardShellProps } from "./dashboard-shell-types";
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

export function DashboardSidebar({
  userName,
  role,
  workspace,
  workspaces,
  publication,
  publications,
}: DashboardShellProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#dedfd9] bg-[#f8f7f2] px-4 py-5 lg:flex">
      <Link href="/dashboard" className="px-2">
        <Logo className="text-lg" />
      </Link>

      <div className="mt-7 space-y-2 rounded-xl border border-[#dedfd9] bg-white p-2.5 shadow-sm">
        <form action={switchWorkspace} className="flex items-center gap-2">
          <label htmlFor="workspace-switcher" className="sr-only">Active workspace</label>
          <select id="workspace-switcher" name="organizationId" defaultValue={workspace.id} className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none">
            {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="rounded-md border border-[#dedfd9] px-2 py-1 text-[10px] font-semibold text-[#687279]">Switch</button>
        </form>
        <form action={switchPublication} className="flex items-center gap-2 border-t border-[#ecece8] pt-2">
          <label htmlFor="publication-switcher" className="sr-only">Active publication</label>
          <select id="publication-switcher" name="publicationId" defaultValue={publication.id} className="min-w-0 flex-1 bg-transparent text-xs text-[#687279] outline-none">
            {publications.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="rounded-md border border-[#dedfd9] px-2 py-1 text-[10px] font-semibold text-[#687279]">Open</button>
        </form>
        <Link href="/onboarding?newWorkspace=1" className="block border-t border-[#ecece8] pt-2 text-center text-[10px] font-semibold text-[#687279] hover:text-[#172329]">+ New workspace</Link>
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
        {hasPermission(role, "audit:read") ? <Link href="/audit" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#687279] transition hover:bg-white hover:text-[#172329]"><History className="size-4" strokeWidth={1.9} />Audit history</Link> : null}
      </nav>

      <div className="mt-auto border-t border-[#dedfd9] pt-4">
        <div className="mb-2 flex items-center gap-2.5 px-2">
          <div className="grid size-8 place-items-center rounded-full bg-[#20343a] text-xs font-semibold text-white">{userName.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{userName}</p>
            <p className="text-[10px] capitalize text-[#8a9397]">{role}</p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
