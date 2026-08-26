import { Suspense } from "react";
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
  return (
    <div className="min-h-screen bg-[#f4f3ed]">
      <DashboardSidebar
        userName={session.user.name}
        canCreateWorkspace={canCreateWorkspace}
        showWorkspaceSwitcher={showWorkspaceSwitcher}
        {...context}
      />
      <MobileHeader
        userName={session.user.name}
        canCreateWorkspace={canCreateWorkspace}
        showWorkspaceSwitcher={showWorkspaceSwitcher}
        {...context}
      />
      <div className="lg:pl-[248px]">{children}</div>
    </div>
  );
}
