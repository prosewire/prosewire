import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readingMinutes, slugify } from "@prosewire/core";
import { PublicHeader } from "@/components/public-header";
import { ReadingProgress } from "@/components/public-progress";
import { getPublicBlog, getPublicPost, getPublicPosts } from "@/server/data";

export async function generateMetadata({ params }: { params: Promise<{ blog: string; slug: string }> }): Promise<Metadata> {
  const { blog: blogSlug, slug } = await params;
  const blog = await getPublicBlog(blogSlug);
  if (!blog) return {};
  const post = await getPublicPost(blog.id, slug);
  if (!post) return {};
  const canonical = post.canonicalUrl ?? (blog.publicUrl ? `${blog.publicUrl}/${post.slug}` : undefined);
  return { title: post.seoTitle ?? post.title, description: post.seoDescription ?? post.excerpt, alternates: { canonical }, authors: [{ name: post.author.name }] };
}

export default async function PublicPostPage({ params }: { params: Promise<{ blog: string; slug: string }> }) {
  const { blog: blogSlug, slug } = await params;
  const blog = await getPublicBlog(blogSlug);
  if (!blog) notFound();
  const post = await getPublicPost(blog.id, slug);
  if (!post) notFound();
  const allPosts = await getPublicPosts(blog.id);
  const related = allPosts.filter((item) => item.id !== post.id && item.categories.some((entry) => post.categories.some((own) => own.categoryId === entry.categoryId))).slice(0, 2);
  const headings = (post.contentMarkdown.match(/^#{2,3}\s+.+$/gm) ?? []).map((heading) => ({ level: heading.startsWith('###') ? 3 : 2, label: heading.replace(/^#{2,3}\s+/, ''), id: slugify(heading.replace(/^#{2,3}\s+/, '')) }));
  const canonical = post.canonicalUrl ?? (blog.publicUrl ? `${blog.publicUrl}/${post.slug}` : `${process.env["PROSEWIRE_PUBLIC_URL"] ?? "http://localhost:3000"}/b/${blog.slug}/${post.slug}`);
  const jsonLd = { "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: post.excerpt, datePublished: post.publishedAt?.toISOString(), dateModified: post.updatedAt.toISOString(), mainEntityOfPage: canonical, author: { "@type": "Person", name: post.author.name, description: post.author.bio }, publisher: { "@type": "Organization", name: blog.name } };
  return (
    <main style={{ "--blog-accent": blog.accentColor } as React.CSSProperties} className="min-h-screen bg-[#f8f7f2] text-[#172329]">
      <style dangerouslySetInnerHTML={{ __html: blog.customCss.replace(/<\/style/gi, "<\\/style") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ReadingProgress postId={post.id} />
      <PublicHeader blog={blog} />
      <article>
        <header className="border-b border-black/10 bg-[#efeee7]">
          <div className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
            <Link href={`/b/${blog.slug}`} className="inline-flex items-center gap-2 text-xs font-semibold text-[#69757a]"><ArrowLeft className="size-3.5" />All stories</Link>
            <p className="mt-10 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--blog-accent)]">{post.categories[0]?.category.name ?? 'Article'}</p>
            <h1 className="display-font mt-4 text-5xl leading-[1.03] sm:text-7xl">{post.title}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[#647076]">{post.excerpt}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-[#778186]"><Link href={`/b/${blog.slug}/authors/${post.author.slug}`} className="font-semibold text-[#172329]">{post.author.name}</Link><span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{post.publishedAt?.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{readingMinutes(post.contentMarkdown)} min read</span></div>
          </div>
        </header>
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-12 lg:grid-cols-[180px_minmax(0,760px)] lg:justify-center lg:py-16">
          <aside className="hidden lg:block"><div className="sticky top-8"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#9aa1a4]">On this page</p><nav className="mt-4 space-y-2.5">{headings.map((heading) => <a key={heading.id} href={`#${heading.id}`} className={`block text-[11px] leading-4 text-[#69757a] hover:text-[var(--blog-accent)] ${heading.level === 3 ? 'pl-3' : 'font-medium'}`}>{heading.label}</a>)}</nav></div></aside>
          <div><div className="pw-prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} /><div className="mt-14 rounded-2xl border border-black/10 bg-[#efeee7] p-6"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--blog-accent)]">About the author</p><div className="mt-4 flex gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#172329] text-sm font-bold text-white">{post.author.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><h2 className="text-sm font-semibold">{post.author.name}</h2><p className="mt-1 text-xs font-medium text-[#ef6848]">{post.author.jobTitle}</p><p className="mt-3 text-sm leading-6 text-[#687279]">{post.author.bio}</p><p className="mt-2 text-[10px] text-[#8a9397]">{post.author.credentials}</p></div></div></div></div>
        </div>
      </article>
      {related.length ? <section className="border-t border-black/10 bg-[#efeee7]"><div className="mx-auto max-w-6xl px-5 py-14"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--blog-accent)]">Keep reading</p><h2 className="display-font mt-2 text-3xl">Related fieldnotes</h2><div className="mt-7 grid gap-4 md:grid-cols-2">{related.map((item) => <Link key={item.id} href={`/b/${blog.slug}/${item.slug}`} className="group rounded-2xl border border-black/10 bg-white p-6"><h3 className="display-font text-2xl leading-tight">{item.title}</h3><p className="mt-3 text-sm leading-6 text-[#687279]">{item.excerpt}</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[var(--blog-accent)]">Read story <ArrowRight className="size-3.5 transition group-hover:translate-x-1" /></span></Link>)}</div></div></section> : null}
    </main>
  );
}
