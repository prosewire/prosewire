import { Editor } from "@/components/editor";
import { loadNewPost } from "@/server/page-entrypoints";

export const metadata = { title: "New post" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [query, { blog, authors, categories }] = await Promise.all([
    searchParams,
    loadNewPost(),
  ]);
  const author = authors[0];
  if (!author) throw new Error("Create an author before writing a post");
  return <Editor saved={false} error={query.error} authors={authors} categories={categories} post={{ blogId: blog.id, authorId: author.id, categoryId: categories[0]?.id ?? "", title: "", slug: "", excerpt: "", contentMarkdown: "", contentHtml: "", status: "draft", locale: blog.locale, featured: false, coverImageUrl: "", coverImageAlt: "", seoTitle: "", seoDescription: "", focusKeyword: "", canonicalUrl: "", scheduledAt: "" }} />;
}
