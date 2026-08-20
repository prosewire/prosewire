import { lt } from "drizzle-orm";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { openDb, type Db, type DbResource } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { WorkerConfig } from "./worker-config.ts";

export class AnalyticsRetentionError extends Schema.TaggedError<AnalyticsRetentionError>()(
  "AnalyticsRetentionError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface Interface {
  readonly pruneExpired: (
    now: Date,
  ) => Effect.Effect<number, AnalyticsRetentionError>;
}

export function make(db: Db, retentionDays: number): Interface {
  return {
    pruneExpired: Effect.fn("AnalyticsRetention.pruneExpired")((now: Date) => {
      const before = new Date(now.getTime() - retentionDays * 86_400_000);
      return Effect.tryPromise({
        try: async () => {
          const deleted = await db
            .delete(schema.postView)
            .where(lt(schema.postView.occurredAt, before))
            .returning({ id: schema.postView.id });
          return deleted.length;
        },
        catch: (cause) =>
          new AnalyticsRetentionError({
            operation: "prune expired post views",
            cause,
          }),
      });
    }),
  };
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/AnalyticsRetention",
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
            new AnalyticsRetentionError({ operation: "connect", cause }),
        }),
        (resource) =>
          Effect.tryPromise({
            try: resource.close,
            catch: (cause) =>
              new AnalyticsRetentionError({ operation: "close", cause }),
          }).pipe(Effect.ignore),
      );
      return Service.of(make(resource.client, config.analyticsRetentionDays));
    }),
  );

export const layer = layerWith(openDb);

export * as AnalyticsRetention from "./analytics-retention.js";
