import { forbidden, redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { MobileHeader } from "@/components/mobile-header";
import { loadDashboardShell } from "@/server/page-entrypoints";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const result = await loadDashboardShell();
  if (result._tag === "Unauthorized") redirect("/sign-in");
  if (result._tag === "Forbidden") forbidden();
  const { session, blog } = result;
  return (
    <div className="min-h-screen bg-[#f4f3ed]">
      <DashboardSidebar userName={session.user.name} blogName={blog.name} />
      <MobileHeader />
      <div className="lg:pl-[248px]">{children}</div>
    </div>
  );
}
