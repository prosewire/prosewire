import * as schema from "@prosewire/db/schema";
import { and, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { Clock, Context, Effect, Layer } from "effect";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { Database } from "./database.ts";
import { BlogId, type UserId } from "./domain.ts";
import { ObjectStorage } from "./object-storage.ts";

export const create = Effect.fn("MediaDelivery.create")(function* () {
  const database = yield* Database;
  const storage = yield* ObjectStorage.Service;
  const access = yield* BlogAccess.Service;
  const config = yield* WebConfig;

  return {
    resolve: Effect.fn("MediaDelivery.resolve")(function* <E, R>(
      key: string,
      reader: Effect.Effect<UserId | null, E, R>,
    ) {
      if (config.mediaStorage?.delivery !== "signed") return null;
      const [row] = yield* database.execute("media.deliveryVariant", (client) =>
        client
          .select({
            variant: schema.mediaVariant,
            blogId: schema.mediaAsset.blogId,
          })
          .from(schema.mediaVariant)
          .innerJoin(
            schema.mediaAsset,
            eq(schema.mediaAsset.id, schema.mediaVariant.assetId),
          )
          .where(
            and(
              eq(schema.mediaVariant.storageKey, key),
              eq(schema.mediaAsset.status, "ready"),
            ),
          )
          .limit(1),
      );
      if (!row) return null;
      const now = new Date(yield* Clock.currentTimeMillis);
      const published = yield* database.execute(
        "media.deliveryVisibility",
        (client) =>
          client
            .select({ id: schema.post.id })
            .from(schema.post)
            .where(
              and(
                eq(schema.post.blogId, row.blogId),
                eq(schema.post.status, "published"),
                isNotNull(schema.post.publishedAt),
                lte(schema.post.publishedAt, now),
                or(
                  eq(schema.post.coverImageAssetId, row.variant.assetId),
                  sql`strpos(${schema.post.contentMarkdown}, ${row.variant.publicUrl}) > 0`,
                ),
              ),
            )
            .limit(1),
      );
      const isPublic = published.length > 0;
      if (!isPublic) {
        const userId = yield* reader;
        if (!userId) return null;
        const allowed = yield* access
          .requireRead(BlogId.make(row.blogId), userId)
          .pipe(
            Effect.as(true),
            Effect.catchTag("BlogAccessDenied", () => Effect.succeed(false)),
          );
        if (!allowed) return null;
      }
      return {
        signedUrl: (method: "GET" | "HEAD") =>
          storage.signedReadUrl(key, method),
      };
    }),
  };
});

export class Service extends Context.Service<
  Service,
  Effect.Success<ReturnType<typeof create>>
>()("@prosewire/web/MediaDelivery") {}

export const layer = Layer.effect(Service, create());
export * as MediaDelivery from "./media-delivery";
