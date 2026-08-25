import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import { WorkerDatabase } from "./database.ts";
import { PostId, PublishedPost } from "./domain.ts";

export class PublishingDatabaseError extends Schema.TaggedError<PublishingDatabaseError>()(
  "PublishingDatabaseError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface Interface {
  readonly publishDue: (
    now: Date,
  ) => Effect.Effect<ReadonlyArray<PublishedPost>, PublishingDatabaseError>;
}

export function make(db: Db): Interface {
  return {
    publishDue: Effect.fn("PublishingRepository.publishDue")((now: Date) =>
      Effect.tryPromise({
        try: () =>
          db.transaction(async (tx) => {
            const published = await tx
              .update(schema.post)
              .set({ status: "published", publishedAt: now, updatedAt: now })
              .where(
                and(
                  eq(schema.post.status, "scheduled"),
                  isNotNull(schema.post.scheduledAt),
                  lte(schema.post.scheduledAt, now),
                ),
              )
              .returning({
                id: schema.post.id,
                title: schema.post.title,
                blogId: schema.post.blogId,
              });
            if (published.length > 0) {
              const blogIds = [
                ...new Set(published.map((post) => post.blogId)),
              ];
              const publications = await tx
                .select({
                  id: schema.blog.id,
                  organizationId: schema.blog.organizationId,
                })
                .from(schema.blog)
                .where(inArray(schema.blog.id, blogIds));
              const organizationByBlog = new Map(
                publications.map((publication) => [
                  publication.id,
                  publication.organizationId,
                ]),
              );
              const auditEntries = published.map((post) => {
                const organizationId = organizationByBlog.get(post.blogId);
                if (!organizationId) {
                  throw new Error(
                    `Publication ${post.blogId} has no owning workspace`,
                  );
                }
                return {
                  organizationId,
                  blogId: post.blogId,
                  action: "post.published_scheduled",
                  entityType: "post",
                  entityId: post.id,
                  after: { source: "worker", status: "published" },
                };
              });
              await tx.insert(schema.auditLog).values(auditEntries);
            }
            return published.map(
              ({ id, title }) =>
                new PublishedPost({ id: PostId.make(id), title }),
            );
          }),
        catch: (cause) =>
          new PublishingDatabaseError({
            operation: "publish due posts",
            cause,
          }),
      }),
    ),
  };
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/PublishingRepository",
) {}

export const layer = Layer.effect(
  Service,
  Effect.map(WorkerDatabase.Service, ({ client }) => Service.of(make(client))),
);

export * as PublishingRepository from "./publishing-repository.js";
