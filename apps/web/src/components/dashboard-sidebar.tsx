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
import Link from "next/link";
import { switchPublication, switchWorkspace } from "@/server/actions";
import { DashboardNavLink } from "./dashboard-nav-link";
import type { DashboardShellProps } from "./dashboard-shell-types";
import {
  DashboardSelectionMenu,
  DashboardUserMenu,
} from "./dashboard-sidebar-menus";
import { DashboardSidebarToggle } from "./dashboard-sidebar-toggle";
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
}: DashboardShellProps) {
  return (
    <aside
      id="dashboard-sidebar"
      className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#dedfd9] bg-[#f8f7f2] px-4 py-5 transition-[width,padding] duration-200 ease-linear group-data-[collapsed=true]/sidebar:w-[72px] group-data-[collapsed=true]/sidebar:px-3 lg:flex"
    >
      <div className="flex h-8 items-center justify-between px-2 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0">
        <Link
          href="/dashboard"
          className="group-data-[collapsed=true]/sidebar:hidden"
        >
          <Logo className="text-lg" />
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="group-data-[collapsed=true]/sidebar:hidden">
            <ThemeToggle className="size-8 rounded-lg" />
          </span>
          <DashboardSidebarToggle />
        </div>
      </div>

      <div className="mt-7 space-y-1">
        {showWorkspaceSwitcher ? (
          <DashboardSelectionMenu
            action={switchWorkspace}
            canCreate={canCreateWorkspace}
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
          <DashboardNavLink key={item.href} href={item.href} label={item.label}>
            <item.icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate group-data-[collapsed=true]/sidebar:sr-only">
              {item.label}
            </span>
          </DashboardNavLink>
        ))}
      </nav>

      <div className="mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa1a4] group-data-[collapsed=true]/sidebar:hidden">
        Manage
      </div>
      <div className="mx-2 mt-6 hidden h-px bg-[#dedfd9] group-data-[collapsed=true]/sidebar:block" />
      <nav className="mt-2 space-y-1 group-data-[collapsed=true]/sidebar:mt-4">
        {manage.map((item) => (
          <DashboardNavLink key={item.href} href={item.href} label={item.label}>
            <item.icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate group-data-[collapsed=true]/sidebar:sr-only">
              {item.label}
            </span>
          </DashboardNavLink>
        ))}
        {canReadAudit ? (
          <DashboardNavLink href="/audit" label="Audit history">
            <ClockCounterClockwise className="size-4 shrink-0" aria-hidden />
            <span className="truncate group-data-[collapsed=true]/sidebar:sr-only">
              Audit history
            </span>
          </DashboardNavLink>
        ) : null}
      </nav>

      <div className="mt-auto border-t border-[#dedfd9] pt-4">
        <DashboardUserMenu role={role} userName={userName} />
      </div>

      <DashboardSidebarToggle rail />
    </aside>
  );
}
