import { Context, Effect, Layer, Redacted, Schema, Scope } from "effect";
import { openDb, type Db, type DbResource } from "@prosewire/db/client";
import { WebConfig } from "./config.ts";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Database operation failed: ${this.operation}`;
  }
}

export interface DatabaseShape {
  readonly client: Effect.Effect<Db, DatabaseError>;
  readonly execute: <A>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<A>,
  ) => Effect.Effect<A, DatabaseError>;
}

export class Database extends Context.Service<Database, DatabaseShape>()(
  "@prosewire/web/Database",
) {
  static readonly layerWith = (open: (databaseUrl: string) => DbResource) =>
    Layer.effect(
      Database,
      Effect.gen(function* () {
        const config = yield* WebConfig;
        const scope = yield* Effect.scope;
        const getResource = yield* Effect.cached(
          Effect.acquireRelease(
            Effect.try({
              try: () => open(Redacted.value(config.databaseUrl)),
              catch: (cause) =>
                new DatabaseError({ operation: "connect", cause }),
            }),
            (resource) =>
              Effect.tryPromise({
                try: resource.close,
                catch: (cause) =>
                  new DatabaseError({ operation: "close", cause }),
              }).pipe(
                Effect.tapError((error) =>
                  Effect.logError("Failed to close the web database", error),
                ),
                Effect.ignore,
              ),
          ).pipe(Effect.provideService(Scope.Scope, scope)),
        );
        const client = getResource.pipe(Effect.map((resource) => resource.client));
        const execute: DatabaseShape["execute"] = (operation, evaluate) =>
          Effect.flatMap(client, (client) =>
            Effect.tryPromise({
              try: () => evaluate(client),
              catch: (cause) => new DatabaseError({ operation, cause }),
            }),
          ).pipe(Effect.withSpan(operation));
        return { client, execute };
      }),
    );

  static readonly layer = Database.layerWith(openDb);
}

export * as DatabaseService from "./database";
