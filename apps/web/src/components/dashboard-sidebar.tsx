import {
  ChartBar,
  ClockCounterClockwise,
  Code,
  FileText,
  GearSix,
  SquaresFour,
  Stack,
  UsersThree,
} from "@phosphor-icons/react/ssr";
import { hasPermission } from "@prosewire/core";
import Link from "next/link";
import { switchPublication, switchWorkspace } from "@/server/actions";
import { DashboardNavLink } from "./dashboard-nav-link";
import type { DashboardShellProps } from "./dashboard-shell-types";
import { Logo } from "./logo";
import { Select } from "./select";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

const primary = [
  { href: "/dashboard", label: "Overview", icon: SquaresFour },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/content", label: "Content library", icon: Stack },
  { href: "/analytics", label: "Analytics", icon: ChartBar },
];

const manage = [
  { href: "/team", label: "Authors & team", icon: UsersThree },
  { href: "/integrate", label: "Integrate", icon: Code },
  { href: "/settings", label: "Settings", icon: GearSix },
];

export function DashboardSidebar({
  userName,
  canCreateWorkspace,
  showWorkspaceSwitcher,
  role,
  workspace,
  workspaces,
  publication,
  publications,
}: DashboardShellProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#dedfd9] bg-[#f8f7f2] px-4 py-5 lg:flex">
      <div className="flex items-center justify-between px-2">
        <Link href="/dashboard">
          <Logo className="text-lg" />
        </Link>
        <ThemeToggle className="size-8 rounded-lg" />
      </div>

      <div className="mt-7 space-y-2 rounded-xl border border-[#dedfd9] bg-white p-2.5 shadow-sm">
        {showWorkspaceSwitcher ? (
          <form action={switchWorkspace} className="flex items-center gap-2">
            <Select
              id="workspace-switcher"
              name="organizationId"
              label="Active workspace"
              labelClassName="sr-only"
              defaultValue={workspace.id}
              options={workspaces.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              size="small"
              className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-xs font-semibold shadow-none hover:border-transparent hover:bg-[var(--paper)]"
            />
            <button className="rounded-md border border-[#dedfd9] px-2 py-1 text-[10px] font-semibold text-[#687279]">
              Switch
            </button>
          </form>
        ) : null}
        <form
          action={switchPublication}
          className={`flex items-center gap-2 ${showWorkspaceSwitcher ? "border-t border-[#ecece8] pt-2" : ""}`}
        >
          <Select
            id="publication-switcher"
            name="publicationId"
            label="Active publication"
            labelClassName="sr-only"
            defaultValue={publication.id}
            options={publications.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            size="small"
            className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-xs text-[#687279] shadow-none hover:border-transparent hover:bg-[var(--paper)]"
          />
          <button className="rounded-md border border-[#dedfd9] px-2 py-1 text-[10px] font-semibold text-[#687279]">
            Open
          </button>
        </form>
        {hasPermission(role, "publications:create") ? (
          <Link
            href="/onboarding"
            className="block border-t border-[#ecece8] pt-2 text-center text-[10px] font-semibold text-[#687279] hover:text-[#172329]"
          >
            + New publication
          </Link>
        ) : null}
        {canCreateWorkspace ? (
          <Link
            href="/onboarding?newWorkspace=1"
            className="block border-t border-[#ecece8] pt-2 text-center text-[10px] font-semibold text-[#687279] hover:text-[#172329]"
          >
            + New workspace
          </Link>
        ) : null}
      </div>

      <nav className="mt-6 space-y-1">
        {primary.map((item) => (
          <DashboardNavLink key={item.href} href={item.href}>
            <item.icon className="size-4" />
            {item.label}
          </DashboardNavLink>
        ))}
      </nav>

      <div className="mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa1a4]">
        Manage
      </div>
      <nav className="mt-2 space-y-1">
        {manage.map((item) => (
          <DashboardNavLink key={item.href} href={item.href}>
            <item.icon className="size-4" />
            {item.label}
          </DashboardNavLink>
        ))}
        {hasPermission(role, "audit:read") ? (
          <DashboardNavLink href="/audit">
            <ClockCounterClockwise className="size-4" />
            Audit history
          </DashboardNavLink>
        ) : null}
      </nav>

      <div className="mt-auto border-t border-[#dedfd9] pt-4">
        <div className="mb-2 flex items-center gap-2.5 px-2">
          <div className="grid size-8 place-items-center rounded-full bg-[#20343a] text-xs font-semibold text-white">
            {userName.slice(0, 1).toUpperCase()}
          </div>
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
