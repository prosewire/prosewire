import { Archive, Download, Plus, Search } from "lucide-react";
import Link from "next/link";
import { canUpdatePost, hasPermission } from "@prosewire/core";
import { StatusBadge } from "@/components/ui";
import { bulkArchivePosts } from "@/server/actions";
import { loadDashboardPosts } from "@/server/page-entrypoints";
import { dashboardData } from "../dashboard-result";

export const metadata = { title: "Posts" };

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { blog, posts, context } = dashboardData(await loadDashboardPosts(q));
  const canCreate = hasPermission(context.role, "content:create");
  const canArchive = hasPermission(context.role, "content:archive");
  const canEdit = (post: (typeof posts)[number]) =>
    canUpdatePost(
      context.role,
      post.createdById,
      context.userId,
    ) &&
    (post.status === "draft" ||
      ((post.status === "scheduled" || post.status === "published") &&
        hasPermission(context.role, "content:publish")) ||
      (post.status === "archived" && canArchive));
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold text-[#ef6848]">Content</p><h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">Posts</h1><p className="mt-2 text-sm text-[#6e787d]">Write, review, schedule, and update every article.</p></div>
        {canCreate ? <Link href="/posts/new" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#ef6848] px-4 text-sm font-semibold text-white shadow-sm"><Plus className="size-4" />New post</Link> : null}
      </header>

      <form className="mt-7 flex flex-col gap-2 sm:flex-row">
        <label className="relative max-w-md flex-1"><Search className="absolute left-3 top-3 size-4 text-[#9aa1a4]" /><input name="q" defaultValue={q} placeholder="Search titles and summaries…" className="h-10 w-full rounded-xl border border-[#d7d9d3] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#ef6848]" /></label>
        <button className="h-10 rounded-xl border border-[#d7d9d3] bg-white px-4 text-sm font-semibold">Search</button>
        <a href={`/api/export/${blog.slug}?format=json`} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#d7d9d3] bg-white px-4 text-sm font-semibold"><Download className="size-3.5" />Portable export</a>
        <a href={`/api/export/${blog.slug}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#d7d9d3] bg-white px-4 text-sm font-semibold">CSV</a>
      </form>

      <form action={bulkArchivePosts} className="card mt-4 overflow-hidden">
        <input type="hidden" name="blogId" value={blog.id} />
        <div className="flex items-center justify-between border-b border-[#e2e3de] bg-[#fbfbf8] px-4 py-3"><p className="text-xs font-semibold text-[#6d777c]">{posts.length} posts</p>{canArchive ? <button className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9dbd5] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#687279]"><Archive className="size-3" />Archive selected</button> : null}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead><tr className="border-b border-[#e5e6e1] text-[10px] font-bold uppercase tracking-[.12em] text-[#9aa1a4]"><th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th><th className="px-2 py-3">Post</th><th className="px-4 py-3">Author</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Views</th><th className="px-4 py-3">Updated</th></tr></thead>
            <tbody className="divide-y divide-[#ecece8]">
              {posts.map((post) => (
                <tr key={post.id} className="bg-white transition hover:bg-[#fafaf7]">
                  <td className="px-4 py-4">{canArchive && post.status !== "archived" ? <input aria-label={`Select ${post.title}`} type="checkbox" name="postId" value={post.id} className="size-4 accent-[#ef6848]" /> : null}</td>
                  <td className="max-w-lg px-2 py-4">{canEdit(post) ? <Link href={`/posts/${post.id}/edit`} className="block"><p className="truncate text-sm font-semibold">{post.title}</p><p className="mt-1 truncate text-[11px] text-[#8a9397]">/{post.slug}</p></Link> : <div><p className="truncate text-sm font-semibold">{post.title}</p><p className="mt-1 truncate text-[11px] text-[#8a9397]">/{post.slug}</p></div>}</td>
                  <td className="px-4 py-4 text-xs text-[#657077]">{post.author.name}</td>
                  <td className="px-4 py-4"><StatusBadge status={post.status} /></td>
                  <td className="px-4 py-4 text-xs tabular-nums text-[#657077]">{post.viewCount}</td>
                  <td className="px-4 py-4 text-xs text-[#7c868a]">{post.updatedAt.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!posts.length ? <div className="bg-white px-5 py-16 text-center"><p className="text-sm font-semibold">No posts found</p><p className="mt-1 text-xs text-[#8a9397]">Try a broader search.</p></div> : null}
      </form>
    </main>
  );
}
