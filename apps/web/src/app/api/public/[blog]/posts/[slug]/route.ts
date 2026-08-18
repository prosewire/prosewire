import { NextResponse } from "next/server";
import { getPublicBlog, getPublicPost } from "@/server/data";
import { serializePublicPost } from "@/server/serialize";

export async function GET(_request: Request, { params }: { params: Promise<{ blog: string; slug: string }> }) {
  const { blog: blogSlug, slug } = await params;
  const blog = await getPublicBlog(blogSlug);
  if (!blog) return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  const post = await getPublicPost(blog.id, slug);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json(
    { blog: { ...blog, createdAt: blog.createdAt.toISOString(), updatedAt: blog.updatedAt.toISOString() }, post: serializePublicPost(post) },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
