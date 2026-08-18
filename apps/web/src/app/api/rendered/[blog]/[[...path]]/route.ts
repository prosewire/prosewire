import { getPublicBlog, getPublicPost, getPublicPosts } from "@/server/data";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function GET(_request: Request, { params }: { params: Promise<{ blog: string; path?: string[] }> }) {
  const { blog: blogSlug, path } = await params;
  const blog = await getPublicBlog(blogSlug);
  if (!blog) return new Response("Blog not found", { status: 404 });
  const customCss = blog.customCss.replace(/<\/style/gi, "<\\/style");
  const styles = `<style>:root{--pw-accent:${escapeHtml(blog.accentColor)}}.pw-root{color:inherit;font:inherit}.pw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}.pw-card{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:14px;padding:20px}.pw-card a,.pw-post a{color:var(--pw-accent)}.pw-meta{opacity:.62;font-size:.8em}.pw-post{max-width:760px}.pw-post-body{line-height:1.75}.pw-post-body img{max-width:100%;height:auto;border-radius:12px}${customCss}</style>`;
  const postSlug = path?.[0];
  if (postSlug) {
    const post = await getPublicPost(blog.id, postSlug);
    if (!post) return new Response("Post not found", { status: 404 });
    return new Response(`${styles}<article class="pw-root pw-post"><header><p class="pw-meta">${escapeHtml(post.categories[0]?.category.name ?? "Article")} · ${String(Math.max(1, Math.ceil(post.contentMarkdown.split(/\s+/).length / 225)))} min read</p><h1 class="pw-post-title">${escapeHtml(post.title)}</h1><p class="pw-post-excerpt">${escapeHtml(post.excerpt)}</p></header><div class="pw-post-body">${post.contentHtml}</div><footer class="pw-author"><strong>${escapeHtml(post.author.name)}</strong><p>${escapeHtml(post.author.bio ?? "")}</p></footer></article>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=60" } });
  }
  const posts = await getPublicPosts(blog.id);
  const cards = posts.map((post) => `<article class="pw-card"><p class="pw-meta">${escapeHtml(post.categories[0]?.category.name ?? "Article")}</p><h2><a href="/b/${encodeURIComponent(blog.slug)}/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.excerpt)}</p><p class="pw-meta">${escapeHtml(post.author.name)} · ${post.publishedAt?.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) ?? ""}</p></article>`).join("");
  return new Response(`${styles}<section class="pw-root"><header><h1>${escapeHtml(blog.name)}</h1><p>${escapeHtml(blog.description)}</p></header><div class="pw-grid">${cards}</div></section>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=60" } });
}
