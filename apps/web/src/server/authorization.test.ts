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
import { Effect, Layer } from "effect";
import { BlogAccess } from "./authorization.ts";
import { databaseLayer } from "./database-test-support.ts";
import { BlogId, UserId } from "./domain.ts";

const databaseUrl = process.env.DATABASE_URL;
const blogId = BlogId.make("11111111-1111-4111-8111-111111111111");
const userId = UserId.make("user-1");

describe.skipIf(!databaseUrl)(
  "publication authorization with PostgreSQL",
  () => {
    let testDatabase: TestDatabase;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("DATABASE_URL is required");
      testDatabase = await openTestDatabase(databaseUrl, "web_authorization");
    });

    beforeEach(async () => {
      await testDatabase.reset();
    });

    afterAll(async () => {
      await testDatabase?.close();
    });

    const seedPublication = async (
      role?: "owner" | "admin" | "editor" | "author" | "viewer",
      slug = "fieldnotes",
    ) => {
      await testDatabase.client.insert(schema.user).values({
        id: userId,
        email: "person@example.com",
        name: "Person",
      });
      await testDatabase.client.insert(schema.organization).values({
        id: "workspace-1",
        name: "Prosewire",
        slug: "prosewire",
      });
      if (role) {
        await testDatabase.client.insert(schema.member).values({
          id: "member-1",
          organizationId: "workspace-1",
          userId,
          role,
        });
      }
      await testDatabase.client.insert(schema.blog).values({
        id: blogId,
        organizationId: "workspace-1",
        name: "Fieldnotes",
        slug,
      });
    };

    const layer = () =>
      BlogAccess.layer.pipe(Layer.provide(databaseLayer(testDatabase.client)));

    it.effect("allows viewers to read but not create content", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedPublication("viewer"));
        const access = yield* BlogAccess.Service;
        const read = yield* access.requireRead(blogId, userId);
        expect(read.role).toBe("viewer");

        const denied = yield* Effect.flip(
          access.requirePostCreate(blogId, userId),
        );
        expect(denied._tag).toBe("BlogAccessDenied");
        if (denied._tag === "BlogAccessDenied") {
          expect(denied.capability).toBe("content:create");
        }
      }).pipe(Effect.provide(layer())),
    );

    it.effect("rejects authenticated users without workspace membership", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedPublication());
        const access = yield* BlogAccess.Service;
        const denied = yield* Effect.flip(access.requireRead(blogId, userId));
        expect(denied._tag).toBe("BlogAccessDenied");
        if (denied._tag === "BlogAccessDenied") {
          expect(denied.capability).toBe("content:read");
        }
      }).pipe(Effect.provide(layer())),
    );

    it.effect("reports invalid persisted models as capability errors", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedPublication("viewer", "Invalid Slug"));
        const access = yield* BlogAccess.Service;
        const failure = yield* Effect.flip(access.findBlog(blogId, userId));

        expect(failure).toBeInstanceOf(BlogAccess.PersistenceError);
        expect(failure.operation).toBe("publication.decodeAuthorized");
      }).pipe(Effect.provide(layer())),
    );
  },
);
