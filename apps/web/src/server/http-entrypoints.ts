import { toNextJsHandler } from "better-auth/next-js";
import { Effect, Option, Result, Schema } from "effect";
import { requireSessionWithHeadersEffect } from "@/lib/session";
import { BlogAccess } from "./authorization.ts";
import { getAuth } from "./auth-service.ts";
import { runAppEffect } from "./app-runtime.ts";
import { BlogSlug, PostId, UserId } from "./domain.ts";
import { promiseEffect } from "./external-effect.ts";
import { PostExport } from "./post-export.ts";
import { PublicContent } from "./public-content.ts";
import { serializePublicPost } from "./serialize.ts";
import { SessionErrors } from "./session-errors.ts";

const ViewEvent = Schema.Struct({
  postId: Schema.String.check(Schema.isUUID()),
  referrer: Schema.optional(Schema.String.check(Schema.isMaxLength(1000))),
});

const parseBlogSlug = (value: string) =>
  Schema.decodeUnknownOption(BlogSlug)(value);

const json = (value: unknown, init?: ResponseInit) => Response.json(value, init);

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

function publicHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  };
}

function feedHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, s-maxage=300",
  };
}

const authHandler = Effect.fn("HttpAuth.handler")(function* () {
  const auth = yield* getAuth();
  return toNextJsHandler(auth);
});

export function authGet(request: Request): Promise<Response> {
  return runAppEffect(
    Effect.flatMap(authHandler(), (handler) =>
      promiseEffect("better-auth", "GET", () => handler.GET(request)),
    ),
    request.signal,
  );
}

export function authPost(request: Request): Promise<Response> {
  return runAppEffect(
    Effect.flatMap(authHandler(), (handler) =>
      promiseEffect("better-auth", "POST", () => handler.POST(request)),
    ),
    request.signal,
  );
}

export async function recordView(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => undefined)) as unknown;
  const parsed = Schema.decodeUnknownOption(ViewEvent)(body);
  if (Option.isNone(parsed)) {
    return json({ error: "Invalid event" }, { status: 400 });
  }
  return runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content
        .recordView(
          PostId.make(parsed.value.postId),
          parsed.value.referrer ?? null,
        )
        .pipe(Effect.as(new Response(null, { status: 204 }))),
    ),
    request.signal,
  );
}

export async function exportPosts(
  request: Request,
  context: { readonly params: Promise<{ readonly blog: string }> },
): Promise<Response> {
  const { blog } = await context.params;
  const slug = parseBlogSlug(blog);
  if (Option.isNone(slug)) return new Response("Blog not found", { status: 404 });

  const result = await runAppEffect(
    Effect.result(
      Effect.gen(function* () {
        const session = yield* requireSessionWithHeadersEffect(request.headers);
        const service = yield* PostExport.Service;
        return yield* service.csv(
          new PostExport.Input({
            blogSlug: slug.value,
            actorId: UserId.make(session.user.id),
          }),
        );
      }),
    ),
    request.signal,
  );

  if (Result.isSuccess(result)) {
    return new Response(result.success.body, {
      headers: {
        "Content-Type": result.success.contentType,
        "Content-Disposition": `attachment; filename="${result.success.filename}"`,
      },
    });
  }
  if (result.failure instanceof SessionErrors.AuthenticationRequired) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (result.failure instanceof BlogAccess.BlogAccessDenied) {
    return new Response("Forbidden", { status: 403 });
  }
  if (result.failure instanceof PostExport.BlogNotFound) {
    return new Response("Blog not found", { status: 404 });
  }
  throw result.failure;
}

export async function listPublicPosts(
  request: Request,
  context: { readonly params: Promise<{ readonly blog: string }> },
): Promise<Response> {
  const { blog: rawSlug } = await context.params;
  const slug = parseBlogSlug(rawSlug);
  if (Option.isNone(slug)) {
    return json({ error: "Blog not found" }, { status: 404 });
  }
  const query = new URL(request.url).searchParams;
  const requestedLimit = Number(query.get("limit") ?? 50);
  const search = query.get("search");
  const category = query.get("category");
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 100))
    : 50;
  const result = await runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.blog(slug.value, {
        ...(search === null ? {} : { search }),
        ...(category === null ? {} : { category }),
        limit,
      }),
    ),
    request.signal,
  );
  if (!result) return json({ error: "Blog not found" }, { status: 404 });
  return json(
    {
      blog: {
        ...result.blog,
        createdAt: result.blog.createdAt.toISOString(),
        updatedAt: result.blog.updatedAt.toISOString(),
      },
      posts: result.posts.map(serializePublicPost),
    },
    { headers: publicHeaders() },
  );
}

export async function getPublicPost(
  request: Request,
  context: {
    readonly params: Promise<{ readonly blog: string; readonly slug: string }>;
  },
): Promise<Response> {
  const { blog: rawBlog, slug: postSlug } = await context.params;
  const blogSlug = parseBlogSlug(rawBlog);
  if (Option.isNone(blogSlug)) {
    return json({ error: "Blog not found" }, { status: 404 });
  }
  const result = await runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.post(blogSlug.value, postSlug),
    ),
    request.signal,
  );
  if (!result) {
    const target = await runAppEffect(
      Effect.flatMap(PublicContent.Service, (content) =>
        content.redirect(blogSlug.value, postSlug),
      ),
      request.signal,
    );
    if (target) {
      return Response.redirect(
        new URL(
          `/api/public/${encodeURIComponent(rawBlog)}/posts/${encodeURIComponent(target)}`,
          request.url,
        ),
        301,
      );
    }
    return json({ error: "Post not found" }, { status: 404 });
  }
  return json(
    {
      blog: {
        ...result.blog,
        createdAt: result.blog.createdAt.toISOString(),
        updatedAt: result.blog.updatedAt.toISOString(),
      },
      post: serializePublicPost(result.post),
    },
    { headers: publicHeaders() },
  );
}

function renderedStyles(blog: {
  readonly accentColor: string;
  readonly customCss: string;
}): string {
  const customCss = blog.customCss.replace(/<\/style/gi, "<\\/style");
  return `<style>:root{--pw-accent:${escapeHtml(blog.accentColor)}}.pw-root{color:inherit;font:inherit}.pw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}.pw-card{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:14px;padding:20px}.pw-card a,.pw-post a{color:var(--pw-accent)}.pw-meta{opacity:.62;font-size:.8em}.pw-post{max-width:760px}.pw-post-body{line-height:1.75}.pw-post-body img{max-width:100%;height:auto;border-radius:12px}${customCss}</style>`;
}

export async function getRenderedContent(
  request: Request,
  context: {
    readonly params: Promise<{
      readonly blog: string;
      readonly path?: ReadonlyArray<string>;
    }>;
  },
): Promise<Response> {
  const { blog: rawBlog, path } = await context.params;
  const blogSlug = parseBlogSlug(rawBlog);
  if (Option.isNone(blogSlug)) return new Response("Blog not found", { status: 404 });
  const postSlug = path?.[0];
  if (postSlug) {
    const result = await runAppEffect(
      Effect.flatMap(PublicContent.Service, (content) =>
        content.post(blogSlug.value, postSlug),
      ),
      request.signal,
    );
    if (!result) return new Response("Post not found", { status: 404 });
    const styles = renderedStyles(result.blog);
    const { post } = result;
    const minutes = Math.max(
      1,
      Math.ceil(post.contentMarkdown.split(/\s+/).length / 225),
    );
    return new Response(
      `${styles}<article class="pw-root pw-post"><header><p class="pw-meta">${escapeHtml(post.categories[0]?.category.name ?? "Article")} · ${String(minutes)} min read</p><h1 class="pw-post-title">${escapeHtml(post.title)}</h1><p class="pw-post-excerpt">${escapeHtml(post.excerpt)}</p></header><div class="pw-post-body">${post.contentHtml}</div><footer class="pw-author"><strong>${escapeHtml(post.author.name)}</strong><p>${escapeHtml(post.author.bio ?? "")}</p></footer></article>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...publicHeaders(),
        },
      },
    );
  }
  const result = await runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) =>
      content.blog(blogSlug.value),
    ),
    request.signal,
  );
  if (!result) return new Response("Blog not found", { status: 404 });
  const styles = renderedStyles(result.blog);
  const cards = result.posts
    .map(
      (post) =>
        `<article class="pw-card"><p class="pw-meta">${escapeHtml(post.categories[0]?.category.name ?? "Article")}</p><h2><a href="/b/${encodeURIComponent(result.blog.slug)}/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.excerpt)}</p><p class="pw-meta">${escapeHtml(post.author.name)} · ${post.publishedAt?.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) ?? ""}</p></article>`,
    )
    .join("");
  return new Response(
    `${styles}<section class="pw-root"><header><h1>${escapeHtml(result.blog.name)}</h1><p>${escapeHtml(result.blog.description)}</p></header><div class="pw-grid">${cards}</div></section>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...publicHeaders(),
      },
    },
  );
}

async function loadFeed(
  request: Request,
  context: { readonly params: Promise<{ readonly blog: string }> },
) {
  const { blog: rawBlog } = await context.params;
  const slug = parseBlogSlug(rawBlog);
  if (Option.isNone(slug)) return null;
  const result = await runAppEffect(
    Effect.flatMap(PublicContent.Service, (content) => content.blog(slug.value)),
    request.signal,
  );
  return result ? { ...result, origin: new URL(request.url).origin } : null;
}

export async function getRss(
  request: Request,
  context: { readonly params: Promise<{ readonly blog: string }> },
): Promise<Response> {
  const result = await loadFeed(request, context);
  if (!result) return new Response("Not found", { status: 404 });
  const items = result.posts
    .map(
      (post) =>
        `<item><title>${escapeXml(post.title)}</title><link>${result.origin}/b/${result.blog.slug}/${post.slug}</link><guid>${result.origin}/b/${result.blog.slug}/${post.slug}</guid><description>${escapeXml(post.excerpt)}</description><pubDate>${post.publishedAt?.toUTCString() ?? ""}</pubDate><author>${escapeXml(post.author.name)}</author></item>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(result.blog.name)}</title><link>${result.origin}/b/${result.blog.slug}</link><description>${escapeXml(result.blog.description)}</description>${items}</channel></rss>`,
    { headers: feedHeaders("application/rss+xml; charset=utf-8") },
  );
}

export async function getSitemap(
  request: Request,
  context: { readonly params: Promise<{ readonly blog: string }> },
): Promise<Response> {
  const result = await loadFeed(request, context);
  if (!result) return new Response("Not found", { status: 404 });
  const urls = [
    `<url><loc>${result.origin}/b/${result.blog.slug}</loc><lastmod>${result.blog.updatedAt.toISOString()}</lastmod></url>`,
    ...result.posts.map(
      (post) =>
        `<url><loc>${result.origin}/b/${result.blog.slug}/${post.slug}</loc><lastmod>${post.updatedAt.toISOString()}</lastmod></url>`,
    ),
  ].join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: feedHeaders("application/xml; charset=utf-8") },
  );
}

export * as HttpEntrypoints from "./http-entrypoints";
