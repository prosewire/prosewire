import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { MobileHeader } from "@/components/mobile-header";
import { requireDashboardSession } from "@/lib/session";
import { getDefaultBlog } from "@/server/data";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [session, blog] = await Promise.all([requireDashboardSession(), getDefaultBlog()]);
  if (!blog) throw new Error("No blog is configured");
  return (
    <div className="min-h-screen bg-[#f4f3ed]">
      <DashboardSidebar userName={session.user.name} blogName={blog.name} />
      <MobileHeader />
      <div className="lg:pl-[248px]">{children}</div>
    </div>
  );
}
