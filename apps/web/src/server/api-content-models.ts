import type { Post } from "@prosewire/contract";
import type * as databaseSchema from "@prosewire/db/schema";

export type ApiPostRow = typeof databaseSchema.post.$inferSelect & {
  readonly author: typeof databaseSchema.author.$inferSelect;
  readonly categories: ReadonlyArray<{
    readonly category: typeof databaseSchema.category.$inferSelect;
  }>;
};

export function toApiPost(row: ApiPostRow): Post {
  return {
    id: row.id,
    blogId: row.blogId,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    contentMarkdown: row.contentMarkdown,
    contentHtml: row.contentHtml,
    coverImageUrl: row.coverImageUrl,
    coverImageAlt: row.coverImageAlt,
    status: row.status,
    locale: row.locale,
    featured: row.featured,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    focusKeyword: row.focusKeyword,
    canonicalUrl: row.canonicalUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.author.id,
      name: row.author.name,
      slug: row.author.slug,
      bio: row.author.bio,
      avatarUrl: row.author.avatarUrl,
      jobTitle: row.author.jobTitle,
      credentials: row.author.credentials,
    },
    categories: row.categories.map(({ category }) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
    })),
  };
}

export * as ApiContentModels from "./api-content-models";
