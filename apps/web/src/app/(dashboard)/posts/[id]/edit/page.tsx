import { hasPermission } from "@prosewire/core";
import { notFound } from "next/navigation";
import { Editor } from "@/components/editor";
import { loadEditPost } from "@/server/page-entrypoints";
import { dashboardData } from "../../../dashboard-result";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    restored?: string;
    error?: string;
  }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = dashboardData(await loadEditPost(id));
  if (!result) notFound();
  const { blog, post, authors, categories, context } = result;
  const canPublish = hasPermission(context.role, "content:publish");
  const canArchive = hasPermission(context.role, "content:archive");
  return (
    <Editor
      canPublish={canPublish}
      publicationName={blog.name}
      publicationUrl={blog.publicUrl ?? `/b/${blog.slug}`}
      saved={query.saved === "1"}
      restored={query.restored === "1"}
      error={query.error}
      authors={authors.map(({ id, name }) => ({ id, name }))}
      categories={categories.map(({ id, name }) => ({ id, name }))}
      locales={blog.locales}
      post={{
        id: post.id,
        blogId: post.blogId,
        authorId: post.authorId,
        categoryIds: post.categories.map(({ categoryId }) => categoryId),
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        contentMarkdown: post.contentMarkdown,
        contentHtml: post.contentHtml,
        status: post.status,
        locale: post.locale,
        featured: post.featured,
        coverImageUrl: post.coverImageUrl ?? "",
        coverImageAlt: post.coverImageAlt ?? "",
        seoTitle: post.seoTitle ?? "",
        seoDescription: post.seoDescription ?? "",
        focusKeyword: post.focusKeyword ?? "",
        canonicalUrl: post.canonicalUrl ?? "",
        scheduledAt: post.scheduledAt
          ? new Date(
              post.scheduledAt.getTime() -
                post.scheduledAt.getTimezoneOffset() * 60_000,
            )
              .toISOString()
              .slice(0, 16)
          : "",
        revisions: post.revisions.map((revision) => ({
          id: revision.id,
          version: revision.version,
          createdAt: revision.createdAt.toISOString(),
          editor:
            revision.editorId === context.userId
              ? "You"
              : revision.editorId
                ? "Team member"
                : "API key or removed member",
          canRestore:
            ((revision.snapshot.status !== "published" &&
              revision.snapshot.status !== "scheduled") ||
              canPublish) &&
            (revision.snapshot.status !== "archived" || canArchive),
          snapshot: {
            title: revision.snapshot.title,
            slug: revision.snapshot.slug,
            excerpt: revision.snapshot.excerpt,
            contentPreview: revision.snapshot.contentMarkdown.slice(0, 1_000),
            contentTruncated: revision.snapshot.contentMarkdown.length > 1_000,
            status: revision.snapshot.status,
            locale: revision.snapshot.locale,
            categoryCount: revision.snapshot.categoryIds?.length ?? null,
          },
        })),
      }}
    />
  );
}
