import { getPublicBlog, getPublicPosts } from "@/server/data";

export async function GET(request: Request, { params }: { params: Promise<{ blog: string }> }) {
  const { blog: slug } = await params;
  const blog = await getPublicBlog(slug);
  if (!blog) return new Response("Not found", { status: 404 });
  const origin = new URL(request.url).origin;
  const posts = await getPublicPosts(blog.id);
  const urls = [`<url><loc>${origin}/b/${blog.slug}</loc><lastmod>${blog.updatedAt.toISOString()}</lastmod></url>`, ...posts.map((post) => `<url><loc>${origin}/b/${blog.slug}/${post.slug}</loc><lastmod>${post.updatedAt.toISOString()}</lastmod></url>`)].join("");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=300" } });
}
