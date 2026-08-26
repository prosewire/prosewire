"use client";

import {
  ChartBar,
  ClockCounterClockwise,
  Code,
  FileText,
  GearSix,
  SidebarSimple,
  SquaresFour,
  Stack,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { switchPublication, switchWorkspace } from "@/server/actions";
import { DashboardNavLink } from "./dashboard-nav-link";
import type { DashboardShellProps } from "./dashboard-shell-types";
import {
  DashboardSelectionMenu,
  DashboardUserMenu,
} from "./dashboard-sidebar-menus";
import { Logo } from "./logo";
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
  canCreatePublication,
  canCreateWorkspace,
  canReadAudit,
  showWorkspaceSwitcher,
  role,
  workspace,
  workspaces,
  publication,
  publications,
  collapsed,
  onToggle,
}: DashboardShellProps & {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <aside
      id="dashboard-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[#dedfd9] bg-[#f8f7f2] py-5 transition-[width,padding] duration-200 ease-linear lg:flex ${
        collapsed ? "w-[72px] px-3" : "w-[248px] px-4"
      }`}
    >
      <div
        className={`flex h-8 items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}
      >
        {collapsed ? null : (
          <Link href="/dashboard">
            <Logo className="text-lg" />
          </Link>
        )}
        <div className="flex items-center gap-1.5">
          {collapsed ? null : <ThemeToggle className="size-8 rounded-lg" />}
          <button
            type="button"
            aria-controls="dashboard-sidebar"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggle}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[#687279] outline-none transition-colors hover:bg-white hover:text-[#172329] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
          >
            <SidebarSimple className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-7 space-y-1">
        {showWorkspaceSwitcher ? (
          <DashboardSelectionMenu
            action={switchWorkspace}
            canCreate={canCreateWorkspace}
            collapsed={collapsed}
            createHref="/onboarding?newWorkspace=1"
            current={workspace}
            items={workspaces}
            kind="workspace"
            label="Workspace"
            name="organizationId"
          />
        ) : null}
        <DashboardSelectionMenu
          action={switchPublication}
          canCreate={canCreatePublication}
          collapsed={collapsed}
          createHref="/onboarding"
          current={publication}
          items={publications}
          kind="publication"
          label="Publication"
          name="publicationId"
        />
      </div>

      <nav className="mt-6 space-y-1">
        {primary.map((item) => (
          <DashboardNavLink
            key={item.href}
            href={item.href}
            collapsed={collapsed}
            label={item.label}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            <span className={collapsed ? "sr-only" : "truncate"}>
              {item.label}
            </span>
          </DashboardNavLink>
        ))}
      </nav>

      <div
        className={
          collapsed
            ? "mx-2 mt-6 h-px bg-[#dedfd9]"
            : "mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa1a4]"
        }
      >
        {collapsed ? null : "Manage"}
      </div>
      <nav className={`${collapsed ? "mt-4" : "mt-2"} space-y-1`}>
        {manage.map((item) => (
          <DashboardNavLink
            key={item.href}
            href={item.href}
            collapsed={collapsed}
            label={item.label}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            <span className={collapsed ? "sr-only" : "truncate"}>
              {item.label}
            </span>
          </DashboardNavLink>
        ))}
        {canReadAudit ? (
          <DashboardNavLink
            href="/audit"
            collapsed={collapsed}
            label="Audit history"
          >
            <ClockCounterClockwise className="size-4 shrink-0" aria-hidden />
            <span className={collapsed ? "sr-only" : "truncate"}>
              Audit history
            </span>
          </DashboardNavLink>
        ) : null}
      </nav>

      <div className="mt-auto border-t border-[#dedfd9] pt-4">
        <DashboardUserMenu
          collapsed={collapsed}
          role={role}
          userName={userName}
        />
      </div>

      <button
        type="button"
        tabIndex={-1}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggle}
        className="group absolute inset-y-0 -right-1.5 hidden w-3 cursor-ew-resize lg:block"
      >
        <span className="absolute inset-y-0 left-1/2 w-px bg-transparent transition-colors group-hover:bg-[var(--accent)]/60" />
      </button>
    </aside>
  );
}
