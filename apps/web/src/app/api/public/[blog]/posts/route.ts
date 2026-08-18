import { NextResponse } from "next/server";
import { getPublicBlog, getPublicPosts } from "@/server/data";
import { serializePublicPost } from "@/server/serialize";

export async function GET(request: Request, { params }: { params: Promise<{ blog: string }> }) {
  const { blog: slug } = await params;
  const blog = await getPublicBlog(slug);
  if (!blog) return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const posts = await getPublicPosts(blog.id, {
    search: query.get("search") ?? undefined,
    category: query.get("category") ?? undefined,
    limit: Math.min(Number(query.get("limit") ?? 50), 100),
  });
  return NextResponse.json(
    { blog: { ...blog, createdAt: blog.createdAt.toISOString(), updatedAt: blog.updatedAt.toISOString() }, posts: posts.map(serializePublicPost) },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
