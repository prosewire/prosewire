import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import { toApiPost } from "./api-content-models.ts";
import { Database } from "./database.ts";
import { BlogId, type PostId } from "./domain.ts";
import { operationError } from "./operation-error.ts";
import { PostErrors } from "./post-errors.ts";
import { version } from "./version.ts";

export interface PostListInput {
  readonly search?: string | undefined;
  readonly status?:
    | "draft"
    | "scheduled"
    | "published"
    | "archived"
    | undefined;
  readonly page: number;
  readonly pageSize: number;
}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "ApiContentPersistenceError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export const create = Effect.fn("ApiContent.create")(function* () {
  const database = yield* Database;
  const persistenceError = operationError(
    (input) => new PersistenceError(input),
  );
  const execute = <A>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<A>,
  ) => database.execute(operation, evaluate).pipe(persistenceError(operation));

  return {
    health: Effect.fn("ApiContent.health")(function* () {
      yield* execute("health.ready", (client) => client.execute(sql`select 1`));
      return { status: "ok" as const, version };
    }),
    listBlogs: Effect.fn("ApiContent.listBlogs")(function* (blogId: BlogId) {
      const rows = yield* execute("blog.listApi", (client) =>
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
          rows: execute("post.listApi", (client) =>
            client.query.post.findMany({
              where,
              with: { author: true, categories: { with: { category: true } } },
              orderBy: [desc(schema.post.updatedAt)],
              limit: input.pageSize,
              offset: (input.page - 1) * input.pageSize,
            }),
          ),
          totals: execute("post.countApi", (client) =>
            client.select({ value: count() }).from(schema.post).where(where),
          ),
        },
        { concurrency: "unbounded" },
      );
      return {
        items: rows.map(toApiPost),
        total: Number(totals[0]?.value ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),
    getPost: Effect.fn("ApiContent.getPost")(function* (
      blogId: BlogId,
      postId: PostId,
    ) {
      const row = yield* execute("post.getApi", (client) =>
        client.query.post.findFirst({
          where: and(
            eq(schema.post.id, postId),
            eq(schema.post.blogId, blogId),
          ),
          with: { author: true, categories: { with: { category: true } } },
        }),
      );
      if (!row) return yield* new PostErrors.PostNotFound({ postId });
      return toApiPost(row);
    }),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/ApiContent",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export * as ApiContent from "./api-content";
