import type {
  PostRevision as ApiPostRevision,
  Post,
} from "@prosewire/contract";
import type * as databaseSchema from "@prosewire/db/schema";
import { Schema } from "effect";
import { PostRevisionSnapshot } from "./post-commands.ts";

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
    coverImageAssetId: row.coverImageAssetId,
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

export function toApiPostRevision(
  row: typeof databaseSchema.postRevision.$inferSelect,
): ApiPostRevision {
  const snapshot = Schema.decodeUnknownSync(PostRevisionSnapshot)(row.snapshot);
  return {
    id: row.id,
    postId: row.postId,
    editorId: row.editorId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    snapshot: {
      authorId: snapshot.authorId,
      title: snapshot.title,
      slug: snapshot.slug,
      excerpt: snapshot.excerpt,
      contentMarkdown: snapshot.contentMarkdown,
      coverImageAssetId: snapshot.coverImageAssetId ?? null,
      coverImageUrl: snapshot.coverImageUrl,
      coverImageAlt: snapshot.coverImageAlt,
      status: snapshot.status,
      locale: snapshot.locale,
      featured: snapshot.featured,
      seoTitle: snapshot.seoTitle,
      seoDescription: snapshot.seoDescription,
      focusKeyword: snapshot.focusKeyword,
      canonicalUrl: snapshot.canonicalUrl,
      scheduledAt: snapshot.scheduledAt?.toISOString() ?? null,
      publishedAt: snapshot.publishedAt?.toISOString() ?? null,
      archivedAt: snapshot.archivedAt?.toISOString() ?? null,
      categoryIds: snapshot.categoryIds ?? null,
    },
  };
}

export * as ApiContentModels from "./api-content-models";
