import { getPublicBlog } from "@/server/data";
import { getDashboardPosts } from "@/server/data";

function cell(value: unknown): string {
  let string = "";
  if (value instanceof Date) string = value.toISOString();
  else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") string = String(value);
  return `"${string.replace(/"/g, '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ blog: string }> }) {
  const { blog: slug } = await params;
  const blog = await getPublicBlog(slug);
  if (!blog) return new Response("Blog not found", { status: 404 });
  const posts = await getDashboardPosts(blog.id);
  const header = ["id", "title", "slug", "status", "locale", "author", "categories", "excerpt", "content_markdown", "seo_title", "seo_description", "published_at", "updated_at"];
  const rows = posts.map((post) => [post.id, post.title, post.slug, post.status, post.locale, post.author.name, post.categories.map((entry) => entry.category.name).join("|"), post.excerpt, post.contentMarkdown, post.seoTitle, post.seoDescription, post.publishedAt, post.updatedAt].map(cell).join(","));
  return new Response([header.map(cell).join(","), ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${blog.slug}-posts.csv"` } });
}
