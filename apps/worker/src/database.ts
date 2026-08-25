import { type Db, type DbResource, openDb } from "@prosewire/db/client";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { WorkerConfig } from "./worker-config.ts";

export class WorkerDatabaseError extends Schema.TaggedError<WorkerDatabaseError>()(
  "WorkerDatabaseError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export interface Interface {
  readonly client: Db;
}

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/worker/Database",
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
            new WorkerDatabaseError({ operation: "connect", cause }),
        }),
        (resource) =>
          Effect.tryPromise({
            try: resource.close,
            catch: (cause) =>
              new WorkerDatabaseError({ operation: "close", cause }),
          }).pipe(
            Effect.tapError((error) =>
              Effect.logError("Failed to close the worker database", error),
            ),
            Effect.ignore,
          ),
      );
      return Service.of({ client: resource.client });
    }),
  );

export const layer = layerWith(openDb);

export * as WorkerDatabase from "./database.js";
