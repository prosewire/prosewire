import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { Db } from "@prosewire/db/client";
import { ApiAccess } from "./api-access.ts";
import { Database, DatabaseError } from "./database.ts";
import { PlatformCrypto } from "./platform-crypto.ts";

function apiKeyDatabase(scopes: ReadonlyArray<string>, calls: Array<string>) {
  const token = "pw_test_key";
  const client = {
    query: {
      apiKey: {
        findFirst: () =>
          Promise.resolve({
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            blogId: "11111111-1111-4111-8111-111111111111",
            keyHash: createHash("sha256").update(token).digest("hex"),
            scopes,
            expiresAt: null,
          }),
      },
    },
  } as unknown as Db;
  return {
    token,
    layer: Layer.succeed(Database, {
      client: Effect.succeed(client),
      execute: (operation, evaluate) => {
        calls.push(operation);
        return Effect.tryPromise({
          try: () => evaluate(client),
          catch: (cause) => new DatabaseError({ operation, cause }),
        });
      },
    }),
  };
}

describe("API key scopes", () => {
  it("requires the exact requested scope", () => {
    expect(ApiAccess.hasScope(["content:read"], "content:read")).toBe(true);
    expect(ApiAccess.hasScope(["content:read"], "content:write")).toBe(false);
  });

  it.effect("authorizes reads without performing a persistence write", () => {
    const calls: Array<string> = [];
    const { token, layer } = apiKeyDatabase(["content:read"], calls);
    return Effect.gen(function* () {
      const access = yield* ApiAccess.Service;
      const principal = yield* access.authenticate(token, "content:read");
      expect(principal.blogId).toBe("11111111-1111-4111-8111-111111111111");
      expect(calls).toEqual(["apiKey.find"]);
    }).pipe(
      Effect.provide(
        ApiAccess.layer.pipe(
          Layer.provide(Layer.mergeAll(layer, PlatformCrypto.layer)),
        ),
      ),
    );
  });

  it.effect("rejects mutation access for read-only keys", () => {
    const calls: Array<string> = [];
    const { token, layer } = apiKeyDatabase(["content:read"], calls);
    return Effect.gen(function* () {
      const access = yield* ApiAccess.Service;
      const denied = yield* Effect.flip(
        access.authenticate(token, "content:write"),
      );
      expect(denied._tag).toBe("ApiScopeDenied");
      expect(calls).toEqual(["apiKey.find"]);
    }).pipe(
      Effect.provide(
        ApiAccess.layer.pipe(
          Layer.provide(Layer.mergeAll(layer, PlatformCrypto.layer)),
        ),
      ),
    );
  });
});
