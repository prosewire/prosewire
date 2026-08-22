import { describe, expect, it } from "@effect/vitest";
import type { Db } from "@prosewire/db/client";
import { Effect, Layer } from "effect";
import { BlogAccess } from "./authorization.ts";
import { Database, DatabaseError } from "./database.ts";
import { BlogId, UserId } from "./domain.ts";

const blogId = BlogId.make("11111111-1111-4111-8111-111111111111");
const userId = UserId.make("user-1");

function databaseWithMembership(
  role: "owner" | "admin" | "editor" | "author" | "viewer" | undefined,
  blogSlug = "fieldnotes",
) {
  const now = new Date("2026-08-20T00:00:00.000Z");
  const rows = role
    ? [
        {
          blog: {
            id: blogId,
            organizationId: "workspace-1",
            name: "Fieldnotes",
            slug: blogSlug,
            description: "",
            locale: "en",
            accentColor: "#ef6848",
            customCss: "",
            publicUrl: null,
            createdAt: now,
            updatedAt: now,
          },
          workspace: {
            id: "workspace-1",
            name: "Prosewire",
            slug: "prosewire",
            logo: null,
            metadata: null,
            createdAt: now,
          },
          memberId: "member-1",
          role,
        },
      ]
    : [];
  const query = {
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({ where: () => Promise.resolve(rows) }),
      }),
    }),
  };
  const client = { select: () => query } as unknown as Db;
  return Layer.succeed(Database, {
    client: Effect.succeed(client),
    execute: (operation, evaluate) =>
      Effect.tryPromise({
        try: () => evaluate(client),
        catch: (cause) => new DatabaseError({ operation, cause }),
      }),
  });
}

describe("publication authorization", () => {
  it.effect("allows viewers to read but not create content", () =>
    Effect.gen(function* () {
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
    }).pipe(
      Effect.provide(
        BlogAccess.layer.pipe(Layer.provide(databaseWithMembership("viewer"))),
      ),
    ),
  );

  it.effect("rejects authenticated users without workspace membership", () =>
    Effect.gen(function* () {
      const access = yield* BlogAccess.Service;
      const denied = yield* Effect.flip(access.requireRead(blogId, userId));
      expect(denied._tag).toBe("BlogAccessDenied");
      if (denied._tag === "BlogAccessDenied") {
        expect(denied.capability).toBe("content:read");
      }
    }).pipe(
      Effect.provide(
        BlogAccess.layer.pipe(Layer.provide(databaseWithMembership(undefined))),
      ),
    ),
  );

  it.effect("reports invalid persisted models as capability errors", () =>
    Effect.gen(function* () {
      const access = yield* BlogAccess.Service;
      const failure = yield* Effect.flip(access.findBlog(blogId, userId));

      expect(failure).toBeInstanceOf(BlogAccess.PersistenceError);
      expect(failure.operation).toBe("publication.decodeAuthorized");
    }).pipe(
      Effect.provide(
        BlogAccess.layer.pipe(
          Layer.provide(databaseWithMembership("viewer", "Invalid Slug")),
        ),
      ),
    ),
  );
});
