import { Editor } from "@/components/editor";
import { getAuthors, getCategories, getDefaultBlog } from "@/server/data";

export const metadata = { title: "New post" };

export default async function NewPostPage() {
  const blog = await getDefaultBlog();
  if (!blog) return null;
  const [authors, categories] = await Promise.all([getAuthors(blog.id), getCategories(blog.id)]);
  const author = authors[0];
  if (!author) throw new Error("Create an author before writing a post");
  return <Editor saved={false} authors={authors} categories={categories} post={{ blogId: blog.id, authorId: author.id, categoryId: categories[0]?.id ?? "", title: "", slug: "", excerpt: "", contentMarkdown: "", contentHtml: "", status: "draft", locale: blog.locale, featured: false, coverImageUrl: "", coverImageAlt: "", seoTitle: "", seoDescription: "", focusKeyword: "", canonicalUrl: "", scheduledAt: "" }} />;
}
