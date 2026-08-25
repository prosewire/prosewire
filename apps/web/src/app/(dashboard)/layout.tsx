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
  const { session, context } = dashboardData(await loadDashboardShell());
  return (
    <div className="min-h-screen bg-[#f4f3ed]">
      <DashboardSidebar userName={session.user.name} {...context} />
      <MobileHeader userName={session.user.name} {...context} />
      <div className="lg:pl-[248px]">{children}</div>
    </div>
  );
}
