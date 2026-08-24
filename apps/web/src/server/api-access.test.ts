import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { ApiAccess } from "./api-access.ts";
import { Database, DatabaseError } from "./database.ts";
import { PlatformCrypto } from "./platform-crypto.ts";

describe("API key scopes", () => {
  it("requires the exact requested scope", () => {
    expect(ApiAccess.hasScope(["content:read"], "content:read")).toBe(true);
    expect(ApiAccess.hasScope(["content:read"], "content:write")).toBe(false);
  });

  it.effect("translates database failures into API access errors", () => {
    const cause = new DatabaseError({
      operation: "apiKey.find",
      cause: new Error("offline"),
    });
    const database = Layer.succeed(Database, {
      client: Effect.fail(cause),
      execute: () => Effect.fail(cause),
    });

    return Effect.gen(function* () {
      const access = yield* ApiAccess.Service;
      const failure = yield* Effect.flip(
        access.authenticate("pw_test_key", "content:read"),
      );

      expect(failure).toBeInstanceOf(ApiAccess.PersistenceError);
      if (failure instanceof ApiAccess.PersistenceError) {
        expect(failure.operation).toBe("apiKey.find");
      }
    }).pipe(
      Effect.provide(
        ApiAccess.layer.pipe(
          Layer.provide(Layer.mergeAll(database, PlatformCrypto.layer)),
        ),
      ),
    );
  });
});
