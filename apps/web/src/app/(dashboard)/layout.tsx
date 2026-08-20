import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { MobileHeader } from "@/components/mobile-header";
import { loadDashboardShell } from "@/server/page-entrypoints";
import { dashboardData } from "./dashboard-result";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, blog } = dashboardData(await loadDashboardShell());
  return (
    <div className="min-h-screen bg-[#f4f3ed]">
      <DashboardSidebar userName={session.user.name} blogName={blog.name} />
      <MobileHeader />
      <div className="lg:pl-[248px]">{children}</div>
    </div>
  );
}
