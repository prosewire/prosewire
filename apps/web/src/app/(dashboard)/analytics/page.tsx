import { Eye, MousePointerClick, Search, TrendingUp } from "lucide-react";
import { Sparkline } from "@/components/sparkline";
import { loadDashboardAnalytics } from "@/server/page-entrypoints";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const { metrics, posts, series } = await loadDashboardAnalytics();
  const published = posts.filter((post) => post.status === "published").sort((a, b) => b.views.length - a.views.length);
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <p className="text-xs font-semibold text-[#ef6848]">Audience</p><h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">Analytics</h1><p className="mt-2 text-sm text-[#6e787d]">A first-party view of what readers are finding useful.</p>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">{[{ label: 'Page views', value: metrics.views, icon: Eye }, { label: 'Published posts', value: metrics.published, icon: TrendingUp }, { label: 'Search coverage', value: '100%', icon: Search }].map((item) => <div key={item.label} className="card p-5"><item.icon className="size-4 text-[#9aa1a4]" /><p className="mt-5 text-3xl font-semibold tracking-[-.04em]">{item.value}</p><p className="mt-1 text-xs text-[#7b8589]">{item.label}</p></div>)}</div>
      <section className="card mt-4 p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Views over time</h2><p className="mt-1 text-[11px] text-[#8a9397]">Seeded events demonstrate the first-party event model.</p></div><MousePointerClick className="size-4 text-[#9aa1a4]" /></div><div className="mt-8 h-44"><Sparkline values={series.map((item) => item.value)} /></div><div className="flex justify-between text-[10px] text-[#9aa1a4]">{series.map((item) => <span key={item.day}>{item.day}</span>)}</div></section>
      <section className="card mt-4 overflow-hidden"><div className="border-b border-[#e2e3de] px-5 py-4"><h2 className="text-sm font-semibold">Top content</h2></div><div className="divide-y divide-[#ecece8]">{published.map((post, index) => <div key={post.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 bg-white px-5 py-4"><span className="text-xs font-bold text-[#b0b6b8]">{String(index + 1).padStart(2, '0')}</span><div><p className="text-sm font-semibold">{post.title}</p><p className="mt-1 text-[11px] text-[#8a9397]">/{post.slug}</p></div><span className="text-sm font-semibold tabular-nums">{post.views.length}</span></div>)}</div></section>
    </main>
  );
}
