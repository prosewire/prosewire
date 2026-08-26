import { hasPermission } from "@prosewire/core";
import { Suspense } from "react";
import type { DashboardShellProps } from "@/components/dashboard-shell-types";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardShellSkeleton } from "@/components/loading-states";
import { MobileHeader } from "@/components/mobile-header";
import { loadDashboardShell } from "@/server/page-entrypoints";
import { dashboardData } from "./dashboard-result";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const { canCreateWorkspace, context, session, showWorkspaceSwitcher } =
    dashboardData(await loadDashboardShell());
  const shellProps = {
    userName: session.user.name,
    canCreatePublication: hasPermission(context.role, "publications:create"),
    canCreateWorkspace,
    canReadAudit: hasPermission(context.role, "audit:read"),
    showWorkspaceSwitcher,
    role: context.role,
    workspace: { id: context.workspace.id, name: context.workspace.name },
    workspaces: context.workspaces.map(({ id, name }) => ({ id, name })),
    publication: {
      id: context.publication.id,
      name: context.publication.name,
    },
    publications: context.publications.map(({ id, name }) => ({ id, name })),
  } satisfies DashboardShellProps;

  return (
    <div
      id="dashboard-shell"
      className="group/sidebar min-h-screen bg-[#f4f3ed]"
      data-collapsed="false"
    >
      <MobileHeader {...shellProps} />
      <DashboardSidebar {...shellProps} />
      <div className="transition-[padding] duration-200 ease-linear lg:pl-[248px] group-data-[collapsed=true]/sidebar:lg:pl-[72px]">
        {children}
      </div>
    </div>
  );
}
