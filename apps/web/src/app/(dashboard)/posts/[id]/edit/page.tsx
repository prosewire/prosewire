import { notFound } from "next/navigation";
import { Editor } from "@/components/editor";
import { getAuthors, getCategories, getDashboardPost } from "@/server/data";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const post = await getDashboardPost(id);
  if (!post) notFound();
  const [authors, categories] = await Promise.all([getAuthors(post.blogId), getCategories(post.blogId)]);
  return <Editor saved={query.saved === "1"} authors={authors} categories={categories} post={{ id: post.id, blogId: post.blogId, authorId: post.authorId, categoryId: post.categories[0]?.categoryId ?? "", title: post.title, slug: post.slug, excerpt: post.excerpt, contentMarkdown: post.contentMarkdown, contentHtml: post.contentHtml, status: post.status, locale: post.locale, featured: post.featured, coverImageUrl: post.coverImageUrl ?? "", coverImageAlt: post.coverImageAlt ?? "", seoTitle: post.seoTitle ?? "", seoDescription: post.seoDescription ?? "", focusKeyword: post.focusKeyword ?? "", canonicalUrl: post.canonicalUrl ?? "", scheduledAt: post.scheduledAt ? new Date(post.scheduledAt.getTime() - post.scheduledAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "" }} />;
}
