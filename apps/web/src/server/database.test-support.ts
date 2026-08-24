import type { Db } from "@prosewire/db/client";
import { Effect, Layer } from "effect";
import { Database, DatabaseError, type DatabaseShape } from "./database.ts";

export function testDatabaseLayer(client: Db) {
  const execute: DatabaseShape["execute"] = (operation, evaluate) =>
    Effect.tryPromise({
      try: () => evaluate(client),
      catch: (cause) => new DatabaseError({ operation, cause }),
    });

  return Layer.succeed(Database, {
    client: Effect.succeed(client),
    execute,
  });
}
