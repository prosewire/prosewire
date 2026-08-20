import { openDb, type Db, type DbResource } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { PostId, PublishedPost } from "./domain.ts";
import { WorkerConfig } from "./worker-config.ts";

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
              await tx.insert(schema.auditLog).values(
                published.map((post) => ({
                  blogId: post.blogId,
                  action: "post.published_scheduled",
                  entityType: "post",
                  entityId: post.id,
                  after: { source: "worker", status: "published" },
                })),
              );
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

export const layerWith = (open: (databaseUrl: string) => DbResource) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const config = yield* WorkerConfig;
      const resource = yield* Effect.acquireRelease(
        Effect.try({
          try: () => open(Redacted.value(config.databaseUrl)),
          catch: (cause) =>
            new PublishingDatabaseError({ operation: "connect", cause }),
        }),
        (resource) =>
          Effect.tryPromise({
            try: resource.close,
            catch: (cause) =>
              new PublishingDatabaseError({ operation: "close", cause }),
          }).pipe(
            Effect.tapError((error) =>
              Effect.logError("Failed to close the worker database", error),
            ),
            Effect.ignore,
          ),
      );
      return Service.of(make(resource.client));
    }),
  );

export const layer = layerWith(openDb);

export * as PublishingRepository from "./publishing-repository.js";
