import { List } from "@phosphor-icons/react/ssr";
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

const links = [
  ["/dashboard", "Overview"],
  ["/posts", "Posts"],
  ["/content", "Content library"],
  ["/analytics", "Analytics"],
  ["/team", "Authors & team"],
  ["/integrate", "Integrate"],
  ["/settings", "Settings"],
] as const;

export function MobileHeader({
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dedfd9] bg-[#f8f7f2]/95 px-4 backdrop-blur lg:hidden">
      <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
        <Logo className="text-base" />
        <span className="truncate text-xs font-semibold text-[#687279]">
          {publication.name}
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <details className="group relative">
          <summary
            aria-label="Open navigation"
            className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-[#dedfd9] bg-white [&::-webkit-details-marker]:hidden"
          >
            <List className="size-4" />
          </summary>
          <div className="absolute right-0 top-11 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-[#d9dbd5] bg-[#f8f7f2] shadow-xl">
            <div className="space-y-2 border-b border-[#dedfd9] p-4">
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
                  placement="mobile"
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
                placement="mobile"
              />
            </div>
            <nav className="grid grid-cols-2 gap-1 p-3">
              {links.map(([href, label]) => (
                <DashboardNavLink key={href} href={href} compact>
                  {label}
                </DashboardNavLink>
              ))}
              {canReadAudit ? (
                <DashboardNavLink href="/audit" compact>
                  Audit history
                </DashboardNavLink>
              ) : null}
            </nav>
            <div className="flex justify-end border-t border-[#dedfd9] px-3 py-2">
              <DashboardUserMenu
                placement="mobile"
                role={role}
                userName={userName}
              />
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
