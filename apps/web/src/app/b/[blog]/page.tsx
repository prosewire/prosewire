import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { blogStyle } from "@/components/blog-style";
import { PublicHeader } from "@/components/public-header";
import { loadPublicBlog } from "@/server/page-entrypoints";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ blog: string }>;
}): Promise<Metadata> {
  const { blog: slug } = await params;
  const result = await loadPublicBlog(slug);
  if (!result) return {};
  const { blog } = result;
  return {
    title: blog.name,
    description: blog.description,
    alternates: { types: { "application/rss+xml": `/b/${blog.slug}/rss.xml` } },
  };
}

export default async function PublicBlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ blog: string }>;
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const [{ blog: slug }, query] = await Promise.all([params, searchParams]);
  const requestedPage = Number(query.page ?? 1);
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.trunc(requestedPage))
    : 1;
  const pageSize = 24;
  const result = await loadPublicBlog(slug, {
    ...(query.q === undefined ? {} : { search: query.q }),
    ...(query.category === undefined ? {} : { category: query.category }),
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
  });
  if (!result) notFound();
  const { blog, categories } = result;
  const hasMore = result.posts.length > pageSize;
  const posts = result.posts.slice(0, pageSize);
  const featured =
    page === 1 ? (posts.find((post) => post.featured) ?? posts[0]) : undefined;
  const rest = posts.filter((post) => post.id !== featured?.id);
  const pageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (query.q) search.set("q", query.q);
    if (query.category) search.set("category", query.category);
    if (nextPage > 1) search.set("page", String(nextPage));
    const suffix = search.toString();
    return `/b/${blog.slug}${suffix ? `?${suffix}` : ""}`;
  };
  return (
    <main
      style={blogStyle(blog.accentColor)}
      className="min-h-screen bg-[#f8f7f2] text-[#172329]"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: blog.customCss.replace(/<\/style/gi, "<\\/style"),
        }}
      />
      <PublicHeader blog={blog} authorSlug={featured?.author.slug} />
      <section className="border-b border-black/10 bg-[#efeee7]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--blog-accent)]">
            Independent publishing
          </p>
          <h1 className="display-font mt-5 max-w-4xl text-5xl leading-[1.02] sm:text-7xl">
            {blog.name}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[#647076]">
            {blog.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link
              href={`/b/${blog.slug}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!query.category ? "bg-[#172329] text-white" : "border border-black/10 bg-white"}`}
            >
              All stories
            </Link>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/b/${blog.slug}?category=${category.slug}`}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${query.category === category.slug ? "bg-[#172329] text-white" : "border border-black/10 bg-white"}`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {query.q ? (
        <section className="mx-auto max-w-6xl px-5 pt-10">
          <div className="flex items-center gap-2 text-sm">
            <MagnifyingGlass className="size-4 text-[var(--blog-accent)]" />
            <span>
              Results for <strong>“{query.q}”</strong> · {posts.length}
            </span>
          </div>
        </section>
      ) : null}

      {featured ? (
        <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <Link
            href={`/b/${blog.slug}/${featured.slug}`}
            className="group grid overflow-hidden rounded-[24px] border border-black/10 bg-[#172329] text-white shadow-sm lg:grid-cols-[1.12fr_.88fr]"
          >
            <div className="p-7 sm:p-10 lg:p-12">
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#f58a6f]">
                Featured · {featured.categories[0]?.category.name ?? "Article"}
              </p>
              <h2 className="display-font mt-5 text-4xl leading-tight sm:text-5xl">
                {featured.title}
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-[#b7c0c3]">
                {featured.excerpt}
              </p>
              <div className="mt-8 flex items-center gap-3 text-xs text-[#d6dcde]">
                <span>{featured.author.name}</span>
                <span className="size-1 rounded-full bg-white/35" />
                <span>
                  {featured.publishedAt?.toLocaleDateString("en", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
            <div className="paper-grid relative min-h-64 border-t border-white/10 bg-[#eadfd3] lg:border-l lg:border-t-0">
              <div className="absolute inset-8 rounded-full border border-[#172329]/15" />
              <div className="absolute inset-16 rounded-full border border-[#172329]/15" />
              <div className="absolute inset-0 grid place-items-center">
                <span className="grid size-24 place-items-center rounded-full bg-[var(--blog-accent)] text-4xl text-white transition group-hover:scale-105">
                  <ArrowRight className="size-8" />
                </span>
              </div>
            </div>
          </Link>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="flex items-end justify-between border-b border-black/10 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--blog-accent)]">
              Latest
            </p>
            <h2 className="display-font mt-2 text-3xl">
              More from {blog.name}
            </h2>
          </div>
        </div>
        {rest.length ? (
          <div className="grid gap-x-8 gap-y-12 pt-8 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((post, index) => (
              <article key={post.id} className="group">
                <Link href={`/b/${blog.slug}/${post.slug}`}>
                  <div
                    className={`paper-grid relative aspect-[1.55] overflow-hidden rounded-2xl border border-black/10 ${["bg-[#dfe8de]", "bg-[#ece0d6]", "bg-[#dfe4e8]"][index % 3]}`}
                  >
                    <span className="absolute left-5 top-5 font-mono text-[10px] text-[#657077]">
                      {String((page - 1) * pageSize + index + 1).padStart(
                        2,
                        "0",
                      )}
                    </span>
                    <span className="absolute bottom-5 right-5 grid size-10 place-items-center rounded-full bg-white shadow-sm transition group-hover:translate-x-1">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                  <p className="mt-5 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--blog-accent)]">
                    {post.categories[0]?.category.name ?? "Article"}
                  </p>
                  <h3 className="display-font mt-2 text-2xl leading-tight">
                    {post.title}
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#687279]">
                    {post.excerpt}
                  </p>
                  <p className="mt-4 text-[11px] text-[#8a9397]">
                    {post.author.name} ·{" "}
                    {post.publishedAt?.toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold">
              No published stories match this search.
            </p>
            <Link
              href={`/b/${blog.slug}`}
              className="mt-3 inline-block text-xs font-semibold text-[var(--blog-accent)]"
            >
              Clear filters
            </Link>
          </div>
        )}
        <nav aria-label="Post pages" className="mt-10 flex justify-between">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="text-sm font-semibold text-[var(--blog-accent)]"
            >
              ← Newer posts
            </Link>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Link
              href={pageHref(page + 1)}
              className="text-sm font-semibold text-[var(--blog-accent)]"
            >
              Older posts →
            </Link>
          ) : null}
        </nav>
      </section>
      <footer className="border-t border-black/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-[#7b8589] sm:flex-row sm:items-center sm:justify-between">
          <span className="display-font text-base font-bold text-[#172329]">
            {blog.name}
          </span>
          <span>
            Published with Prosewire ·{" "}
            <Link href={`/b/${blog.slug}/rss.xml`}>RSS</Link> ·{" "}
            <Link href={`/b/${blog.slug}/sitemap.xml`}>Sitemap</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
