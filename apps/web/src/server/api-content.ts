import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import * as schema from "@prosewire/db/schema";
import { Database } from "./database.ts";
import {
  AuthorId,
  BlogId,
  CategoryId,
  PostId,
} from "./domain.ts";
import { PostErrors } from "./post-errors.ts";

export interface PostListInput {
  readonly search?: string | undefined;
  readonly status?: "draft" | "scheduled" | "published" | "archived" | undefined;
  readonly page: number;
  readonly pageSize: number;
}

type PostWithRelations = typeof schema.post.$inferSelect & {
  readonly author: typeof schema.author.$inferSelect;
  readonly categories: ReadonlyArray<{
    readonly category: typeof schema.category.$inferSelect;
  }>;
};

function serializePost(row: PostWithRelations) {
  return {
    id: PostId.make(row.id),
    blogId: BlogId.make(row.blogId),
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
      id: AuthorId.make(row.author.id),
      name: row.author.name,
      slug: row.author.slug,
      bio: row.author.bio,
      avatarUrl: row.author.avatarUrl,
      jobTitle: row.author.jobTitle,
      credentials: row.author.credentials,
    },
    categories: row.categories.map(({ category }) => ({
      id: CategoryId.make(category.id),
      name: category.name,
      slug: category.slug,
      description: category.description,
    })),
  };
}

export const create = Effect.fn("ApiContent.create")(function* () {
  const database = yield* Database;

  return {
    health: Effect.fn("ApiContent.health")(function* () {
      yield* database.execute("health.ready", (client) =>
        client.execute(sql`select 1`),
      );
      return { status: "ok" as const, version: "0.1.0" };
    }),
    listBlogs: Effect.fn("ApiContent.listBlogs")(function* (blogId: BlogId) {
      const rows = yield* database.execute("blog.listApi", (client) =>
        client.query.blog.findMany({ where: eq(schema.blog.id, blogId) }),
      );
      return rows.map((row) => ({
        ...row,
        id: BlogId.make(row.id),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));
    }),
    listPosts: Effect.fn("ApiContent.listPosts")(function* (
      blogId: BlogId,
      input: PostListInput,
    ) {
      const filters = [eq(schema.post.blogId, blogId)];
      if (input.status) filters.push(eq(schema.post.status, input.status));
      if (input.search?.trim()) {
        const searchFilter = or(
          ilike(schema.post.title, `%${input.search}%`),
          ilike(schema.post.excerpt, `%${input.search}%`),
        );
        if (searchFilter) filters.push(searchFilter);
      }
      const where = and(...filters);
      const { rows, totals } = yield* Effect.all(
        {
          rows: database.execute("post.listApi", (client) =>
            client.query.post.findMany({
              where,
              with: { author: true, categories: { with: { category: true } } },
              orderBy: [desc(schema.post.updatedAt)],
              limit: input.pageSize,
              offset: (input.page - 1) * input.pageSize,
            }),
          ),
          totals: database.execute("post.countApi", (client) =>
            client.select({ value: count() }).from(schema.post).where(where),
          ),
        },
        { concurrency: "unbounded" },
      );
      return {
        items: rows.map(serializePost),
        total: Number(totals[0]?.value ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),
    getPost: Effect.fn("ApiContent.getPost")(function* (
      blogId: BlogId,
      postId: PostId,
    ) {
      const row = yield* database.execute("post.getApi", (client) =>
        client.query.post.findFirst({
          where: and(
            eq(schema.post.id, postId),
            eq(schema.post.blogId, blogId),
          ),
          with: { author: true, categories: { with: { category: true } } },
        }),
      );
      if (!row) return yield* new PostErrors.PostNotFound({ postId });
      return serializePost(row);
    }),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/ApiContent",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as ApiContent from "./api-content";
