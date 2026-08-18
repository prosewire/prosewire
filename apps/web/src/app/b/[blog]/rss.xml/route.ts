import { getPublicBlog, getPublicPosts } from "@/server/data";

function xml(value: string): string { return value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char); }

export async function GET(request: Request, { params }: { params: Promise<{ blog: string }> }) {
  const { blog: slug } = await params;
  const blog = await getPublicBlog(slug);
  if (!blog) return new Response("Not found", { status: 404 });
  const origin = new URL(request.url).origin;
  const posts = await getPublicPosts(blog.id);
  const items = posts.map((post) => `<item><title>${xml(post.title)}</title><link>${origin}/b/${blog.slug}/${post.slug}</link><guid>${origin}/b/${blog.slug}/${post.slug}</guid><description>${xml(post.excerpt)}</description><pubDate>${post.publishedAt?.toUTCString() ?? ''}</pubDate><author>${xml(post.author.name)}</author></item>`).join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(blog.name)}</title><link>${origin}/b/${blog.slug}</link><description>${xml(blog.description)}</description>${items}</channel></rss>`, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=300" } });
}
