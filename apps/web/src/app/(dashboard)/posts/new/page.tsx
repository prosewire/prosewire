import { hasPermission } from "@prosewire/core";
import { Editor } from "@/components/editor";
import { loadNewPost } from "@/server/page-entrypoints";
import { dashboardData } from "../../dashboard-result";

export const metadata = { title: "New post" };

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [query, result] = await Promise.all([searchParams, loadNewPost()]);
  const { blog, authors, categories, context } = dashboardData(result);
  const author = authors[0];
  if (!author) throw new Error("Create an author before writing a post");
  return (
    <Editor
      canPublish={hasPermission(context.role, "content:publish")}
      publicationName={blog.name}
      publicationUrl={blog.publicUrl ?? `/b/${blog.slug}`}
      saved={false}
      restored={false}
      error={query.error}
      authors={authors.map(({ id, name }) => ({ id, name }))}
      categories={categories.map(({ id, name }) => ({ id, name }))}
      locales={blog.locales}
      post={{
        blogId: blog.id,
        authorId: author.id,
        categoryIds: categories[0] ? [categories[0].id] : [],
        title: "",
        slug: "",
        excerpt: "",
        contentMarkdown: "",
        contentHtml: "",
        status: "draft",
        locale: blog.locale,
        featured: false,
        coverImageUrl: "",
        coverImageAlt: "",
        seoTitle: "",
        seoDescription: "",
        focusKeyword: "",
        canonicalUrl: "",
        scheduledAt: "",
        revisions: [],
      }}
    />
  );
}
