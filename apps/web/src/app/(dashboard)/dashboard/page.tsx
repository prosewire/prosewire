import { ArrowRight, CalendarClock, Eye, FileText, PenLine, Users2 } from "lucide-react";
import Link from "next/link";
import { canUpdatePost, hasPermission } from "@prosewire/core";
import { Sparkline } from "@/components/sparkline";
import { StatusBadge } from "@/components/ui";
import { loadDashboardOverview } from "@/server/page-entrypoints";
import { dashboardData } from "../dashboard-result";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const { blog, metrics, posts, series, context } = dashboardData(
    await loadDashboardOverview(),
  );
  const canEdit = (post: (typeof posts)[number]) =>
    canUpdatePost(context.role, post.createdById, context.userId) &&
    (post.status === "draft" ||
      ((post.status === "scheduled" || post.status === "published") &&
        hasPermission(context.role, "content:publish")) ||
      (post.status === "archived" &&
        hasPermission(context.role, "content:archive")));
  const recent = posts.slice(0, 5);
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#ef6848]">Publication overview</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">Good morning.</h1>
          <p className="mt-2 text-sm text-[#6e787d]">Here’s what is happening across {blog.name}.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/b/${blog.slug}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d5d8d1] bg-white px-4 text-sm font-semibold shadow-sm">View blog <ArrowRight className="size-3.5" /></Link>
          {hasPermission(context.role, "content:create") ? <Link href="/posts/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ef6848] px-4 text-sm font-semibold text-white shadow-sm"><PenLine className="size-3.5" />New post</Link> : null}
        </div>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Published posts", value: metrics.published, icon: FileText, note: `${String(metrics.drafts)} drafts in progress` },
          { label: "Total views", value: metrics.views, icon: Eye, note: "Across published content" },
          { label: "Scheduled", value: metrics.scheduled, icon: CalendarClock, note: "Publishing worker is watching" },
          { label: "Authors", value: metrics.authors, icon: Users2, note: "Unlimited collaborators" },
        ].map((metric) => (
          <article key={metric.label} className="card p-5">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#707a7f]">{metric.label}</p><metric.icon className="size-4 text-[#9aa1a4]" /></div>
            <p className="mt-4 text-3xl font-semibold tracking-[-.045em]">{metric.value.toLocaleString()}</p>
            <p className="mt-2 text-[11px] text-[#8a9397]">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.42fr_.58fr]">
        <article className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e2e3de] px-5 py-4">
            <div><h2 className="text-sm font-semibold">Recent content</h2><p className="mt-1 text-[11px] text-[#8a9397]">Latest drafts, schedules, and published work</p></div>
            <Link href="/posts" className="text-xs font-semibold text-[#ef6848]">See all posts</Link>
          </div>
          <div className="divide-y divide-[#ecece8]">
            {recent.map((post) => {
              const content = <>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{post.title}</p><p className="mt-1 truncate text-[11px] text-[#8a9397]">{post.author.name} · Updated {post.updatedAt.toLocaleDateString("en", { month: "short", day: "numeric" })}</p></div>
                <span className="text-xs tabular-nums text-[#7c868a]">{post.viewCount} views</span>
                <StatusBadge status={post.status} />
              </>;
              return canEdit(post) ? <Link key={post.id} href={`/posts/${post.id}/edit`} className="grid gap-3 px-5 py-4 transition hover:bg-[#fafaf7] sm:grid-cols-[1fr_auto_auto] sm:items-center">{content}</Link> : <div key={post.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">{content}</div>;
            })}
          </div>
        </article>

        <article className="card p-5">
          <div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold">Reader activity</h2><p className="mt-1 text-[11px] text-[#8a9397]">Recent page views</p></div><span className="rounded-lg bg-[#f0f1ed] px-2 py-1 text-[10px] font-semibold text-[#69757a]">14 days</span></div>
          <div className="mt-8 flex items-end justify-between"><div><p className="text-3xl font-semibold tracking-[-.045em]">{metrics.views}</p><p className="mt-1 text-[11px] font-medium text-[#1f6e52]">Content is discoverable</p></div></div>
          <div className="mt-5"><Sparkline values={series.map((item) => item.value)} /></div>
          <div className="mt-6 border-t border-[#ecece8] pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa1a4]">Next up</p>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#f6f5f0] p-3"><div className="grid size-9 place-items-center rounded-lg bg-white text-[#ef6848] shadow-sm"><CalendarClock className="size-4" /></div><div><p className="text-xs font-semibold">Scheduled publishing</p><p className="mt-0.5 text-[10px] text-[#889195]">Worker checks every 30 seconds</p></div></div>
          </div>
        </article>
      </section>
    </main>
  );
}
