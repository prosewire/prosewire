import { createHash } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@effect/vitest";
import * as schema from "@prosewire/db/schema";
import { openTestDatabase, type TestDatabase } from "@prosewire/db/testing";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { ApiAccess } from "./api-access.ts";
import { Database, DatabaseError } from "./database.ts";
import { databaseLayer } from "./database-test-support.ts";
import { PlatformCrypto } from "./platform-crypto.ts";

const databaseUrl = process.env.DATABASE_URL;
const token = "pw_test_key";
const blogId = "11111111-1111-4111-8111-111111111111";

function accessLayer(database: Layer.Layer<Database>) {
  return ApiAccess.layer.pipe(
    Layer.provide(Layer.mergeAll(database, PlatformCrypto.layer)),
  );
}

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
        access.authenticate(token, "content:read"),
      );

      expect(failure).toBeInstanceOf(ApiAccess.PersistenceError);
      if (failure instanceof ApiAccess.PersistenceError) {
        expect(failure.operation).toBe("apiKey.find");
      }
    }).pipe(Effect.provide(accessLayer(database)));
  });
});

describe.skipIf(!databaseUrl)("API key scopes with PostgreSQL", () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    testDatabase = await openTestDatabase(databaseUrl, "web_api_access");
  });

  beforeEach(async () => {
    await testDatabase.reset();
    await testDatabase.client.insert(schema.organization).values({
      id: "workspace-1",
      name: "Prosewire",
      slug: "prosewire",
    });
    await testDatabase.client.insert(schema.blog).values({
      id: blogId,
      organizationId: "workspace-1",
      name: "Fieldnotes",
      slug: "fieldnotes",
    });
    await testDatabase.client.insert(schema.apiKey).values({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      blogId,
      name: "Read only",
      prefix: "pw_test",
      keyHash: createHash("sha256").update(token).digest("hex"),
      scopes: ["content:read"],
    });
  });

  afterAll(async () => {
    await testDatabase?.close();
  });

  it.effect("authorizes reads without performing a persistence write", () =>
    Effect.gen(function* () {
      const access = yield* ApiAccess.Service;
      const principal = yield* access.authenticate(token, "content:read");
      expect(principal.blogId).toBe(blogId);

      const [persistedKey] = yield* Effect.promise(() =>
        testDatabase.client
          .select({ lastUsedAt: schema.apiKey.lastUsedAt })
          .from(schema.apiKey)
          .where(eq(schema.apiKey.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")),
      );
      expect(persistedKey?.lastUsedAt).toBeNull();
    }).pipe(Effect.provide(accessLayer(databaseLayer(testDatabase.client)))),
  );

  it.effect("rejects mutation access for read-only keys", () =>
    Effect.gen(function* () {
      const access = yield* ApiAccess.Service;
      const denied = yield* Effect.flip(
        access.authenticate(token, "content:write"),
      );
      expect(denied._tag).toBe("ApiScopeDenied");
    }).pipe(Effect.provide(accessLayer(databaseLayer(testDatabase.client)))),
  );
});
