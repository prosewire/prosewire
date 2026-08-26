import { hasPermission } from "@prosewire/core";
import { cookies } from "next/headers";
import { Suspense } from "react";
import type { DashboardShellProps } from "@/components/dashboard-shell-types";
import { DashboardSidebarFrame } from "@/components/dashboard-sidebar-frame";
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
  const sidebarCollapsed =
    (await cookies()).get("prosewire-sidebar")?.value === "collapsed";
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
    <div className="min-h-screen bg-[#f4f3ed]">
      <MobileHeader {...shellProps} />
      <DashboardSidebarFrame
        {...shellProps}
        defaultCollapsed={sidebarCollapsed}
      >
        {children}
      </DashboardSidebarFrame>
    </div>
  );
}
