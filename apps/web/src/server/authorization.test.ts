import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { Db } from "@prosewire/db/client";
import { BlogAccess } from "./authorization.ts";
import { Database, DatabaseError } from "./database.ts";
import { BlogId, UserId } from "./domain.ts";

function databaseWithMembership(
  membership:
    | { readonly role: "owner" | "admin" | "editor" | "author" | "viewer" }
    | undefined,
) {
  const client = {
    query: {
      blogMember: {
        findFirst: () => Promise.resolve(membership),
      },
    },
  } as unknown as Db;
  return Layer.succeed(Database, {
    client: Effect.succeed(client),
    execute: (operation, evaluate) =>
      Effect.tryPromise({
        try: () => evaluate(client),
        catch: (cause) => new DatabaseError({ operation, cause }),
      }),
  });
}

const blogId = BlogId.make("11111111-1111-4111-8111-111111111111");
const userId = UserId.make("user-1");

describe("dashboard blog authorization", () => {
  it.effect("allows viewers to read but not mutate a blog", () =>
    Effect.gen(function* () {
      const access = yield* BlogAccess.Service;
      const read = yield* access.requireRead(blogId, userId);
      expect(read.role).toBe("viewer");

      const denied = yield* Effect.flip(access.requirePostWrite(blogId, userId));
      expect(denied._tag).toBe("BlogAccessDenied");
      if (denied._tag === "BlogAccessDenied") {
        expect(denied.capability).toBe("post:write");
      }
    }).pipe(
      Effect.provide(
        BlogAccess.layer.pipe(
          Layer.provide(databaseWithMembership({ role: "viewer" })),
        ),
      ),
    ),
  );

  it.effect("rejects authenticated users without blog membership", () =>
    Effect.gen(function* () {
      const access = yield* BlogAccess.Service;
      const denied = yield* Effect.flip(access.requireRead(blogId, userId));
      expect(denied._tag).toBe("BlogAccessDenied");
      if (denied._tag === "BlogAccessDenied") {
        expect(denied.capability).toBe("read");
      }
    }).pipe(
      Effect.provide(
        BlogAccess.layer.pipe(Layer.provide(databaseWithMembership(undefined))),
      ),
    ),
  );
});
