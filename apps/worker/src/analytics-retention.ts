import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { lt } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import { WorkerDatabase } from "./database.ts";
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

export interface Store {
  readonly deleteBefore: (
    before: Date,
  ) => Promise<ReadonlyArray<{ readonly id: string }>>;
}

function drizzleStore(db: Db): Store {
  return {
    deleteBefore: (before) =>
      db
        .delete(schema.postView)
        .where(lt(schema.postView.occurredAt, before))
        .returning({ id: schema.postView.id }),
  };
}

export function make(store: Store, retentionDays: number): Interface {
  return {
    pruneExpired: Effect.fn("AnalyticsRetention.pruneExpired")((now: Date) => {
      const before = new Date(now.getTime() - retentionDays * 86_400_000);
      return Effect.tryPromise({
        try: async () => {
          const deleted = await store.deleteBefore(before);
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

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* WorkerDatabase.Service;
    const config = yield* WorkerConfig;
    return Service.of(
      make(drizzleStore(database.client), config.analyticsRetentionDays),
    );
  }),
);

export * as AnalyticsRetention from "./analytics-retention.js";
