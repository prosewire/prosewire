import type { PublicPost } from "@prosewire/sdk";
import Link from "next/link";
import { type IndexPageProps, type PostPageProps, postPath } from "./shared.ts";

function queryHref(
  basePath: string,
  input: {
    readonly page?: number | undefined;
    readonly search?: string | undefined;
    readonly category?: string | undefined;
  },
) {
  const query = new URLSearchParams();
  if (input.search) query.set("q", input.search);
  if (input.category) query.set("category", input.category);
  if (input.page && input.page > 1) query.set("page", String(input.page));
  const suffix = query.toString();
  return `${basePath}${suffix ? `?${suffix}` : ""}`;
}

function publishedDate(post: PublicPost) {
  if (!post.publishedAt) return null;
  return new Intl.DateTimeFormat(post.locale, {
    dateStyle: "medium",
  }).format(new Date(post.publishedAt));
}

export function ProsewireIndex({
  result,
  basePath,
  search,
  category,
}: IndexPageProps) {
  const { blog, posts, categories, pagination } = result;
  return (
    <main className="pw-root pw-index" data-prosewire="index">
      <header className="pw-index-header" data-prosewire-part="index-header">
        <h1 className="pw-index-title">{blog.name}</h1>
        {blog.description ? (
          <p className="pw-index-description">{blog.description}</p>
        ) : null}
      </header>
      {categories.length > 0 ? (
        <nav className="pw-categories" aria-label="Post categories">
          <Link className="pw-category" href={queryHref(basePath, { search })}>
            All posts
          </Link>
          {categories.map((item) => (
            <Link
              aria-current={category === item.slug ? "page" : undefined}
              className="pw-category"
              href={queryHref(basePath, { search, category: item.slug })}
              key={item.id}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="pw-post-list" data-prosewire-part="post-list">
        {posts.map((post) => {
          const date = publishedDate(post);
          return (
            <article
              className="pw-post-card"
              data-prosewire-part="post-card"
              key={post.id}
            >
              <p className="pw-post-card-meta">
                {post.author.name}
                {date ? ` · ${date}` : ""}
              </p>
              <h2 className="pw-post-card-title">
                <Link href={postPath(basePath, post.slug)}>{post.title}</Link>
              </h2>
              {post.excerpt ? (
                <p className="pw-post-card-excerpt">{post.excerpt}</p>
              ) : null}
            </article>
          );
        })}
      </div>
      <nav className="pw-pagination" aria-label="Post pages">
        {pagination.page > 1 ? (
          <Link
            href={queryHref(basePath, {
              page: pagination.page - 1,
              search,
              category,
            })}
          >
            Newer posts
          </Link>
        ) : (
          <span />
        )}
        {pagination.hasMore ? (
          <Link
            href={queryHref(basePath, {
              page: pagination.page + 1,
              search,
              category,
            })}
          >
            Older posts
          </Link>
        ) : null}
      </nav>
    </main>
  );
}

export function ProsewirePost({
  blog,
  post,
  basePath,
  canonicalUrl,
}: PostPageProps) {
  const date = publishedDate(post);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: canonicalUrl,
    author: { "@type": "Person", name: post.author.name },
    publisher: { "@type": "Organization", name: blog.name },
  };
  return (
    <main className="pw-root pw-post" data-prosewire="post">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <article>
        <header className="pw-post-header" data-prosewire-part="post-header">
          <Link className="pw-back-link" href={basePath}>
            All posts
          </Link>
          <h1 className="pw-post-title">{post.title}</h1>
          {post.excerpt ? (
            <p className="pw-post-excerpt">{post.excerpt}</p>
          ) : null}
          <p className="pw-post-meta">
            <span className="pw-post-author">{post.author.name}</span>
            {date ? <span className="pw-post-date"> · {date}</span> : null}
            <span className="pw-post-reading-time">
              {" "}
              · {post.readingMinutes} min read
            </span>
          </p>
        </header>
        <div
          className="pw-post-body"
          data-prosewire-part="post-body"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
        {post.author.bio ? (
          <footer className="pw-author" data-prosewire-part="author">
            <h2 className="pw-author-name">{post.author.name}</h2>
            <p className="pw-author-bio">{post.author.bio}</p>
          </footer>
        ) : null}
      </article>
    </main>
  );
}
