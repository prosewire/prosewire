import type { Db } from "@prosewire/db/client";
import { Effect, Layer, Redacted } from "effect";
import { WebConfig } from "./config.ts";
import { Database, DatabaseError, type DatabaseShape } from "./database.ts";

export const databaseUrl = process.env["DATABASE_URL"];

export function databaseLayer(client: Db) {
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

export function configLayer(
  url: string,
  deployment: "self-hosted" | "cloud" = "cloud",
) {
  return Layer.succeed(WebConfig, {
    defaultBlog: "fieldnotes",
    publicUrl: "http://localhost:3000",
    databaseUrl: Redacted.make(url),
    authSecret: Redacted.make("test-secret-at-least-32-characters"),
    allowSignUp: false,
    deployment,
    environment: "test",
  });
}
