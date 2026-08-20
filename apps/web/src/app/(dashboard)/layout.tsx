import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { MobileHeader } from "@/components/mobile-header";
import { loadDashboardShell } from "@/server/page-entrypoints";
import { dashboardData } from "./dashboard-result";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, context } = dashboardData(await loadDashboardShell());
  return (
    <div className="min-h-screen bg-[#f4f3ed]">
      <DashboardSidebar userName={session.user.name} {...context} />
      <MobileHeader userName={session.user.name} {...context} />
      <div className="lg:pl-[248px]">{children}</div>
    </div>
  );
}
