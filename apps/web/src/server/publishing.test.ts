import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { Database } from "./database.ts";
import { ApiKeyId, AuthorId, BlogId, CategoryId } from "./domain.ts";
import { PostErrors } from "./post-errors.ts";
import { ApiCreatePostInput, Publishing } from "./publishing.ts";

const blogId = "11111111-1111-4111-8111-111111111111";
const authorId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const keyId = "44444444-4444-4444-8444-444444444444";

describe("Publishing inputs", () => {
  it.effect(
    "decodes external identifiers and dates into the domain command",
    () =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(ApiCreatePostInput)({
          authorId,
          title: "Scheduled post",
          slug: "scheduled-post",
          contentMarkdown: "# Ready",
          status: "scheduled",
          locale: "en",
          featured: false,
          scheduledAt: "2026-08-21T10:30:00.000Z",
          categoryIds: [categoryId],
        });

        expect(command.authorId).toBe(AuthorId.make(authorId));
        expect(command.categoryIds).toEqual([CategoryId.make(categoryId)]);
        expect(command.scheduledAt).toEqual(
          new Date("2026-08-21T10:30:00.000Z"),
        );
      }),
  );

  it.effect("rejects malformed persistent identities at the boundary", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Schema.decodeUnknownEffect(ApiCreatePostInput)({
          authorId: "not-a-uuid",
          title: "Invalid post",
          slug: "invalid-post",
          contentMarkdown: "# Invalid",
          status: "draft",
          locale: "en",
          featured: false,
          categoryIds: [],
        }),
      );

      expect(error._tag).toBe("SchemaError");
    }),
  );
});

describe("Publishing validation", () => {
  it.effect(
    "rejects a scheduled API post before rendering or persistence",
    () => {
      let executions = 0;
      const database = Layer.mock(Database, {
        execute: () => {
          executions += 1;
          return Effect.die("database should not be called");
        },
      });

      return Effect.gen(function* () {
        const publishing = yield* Publishing.Service;
        const error = yield* Effect.flip(
          publishing.createApiPost(
            new ApiCreatePostInput({
              authorId: AuthorId.make(authorId),
              title: "Unscheduled post",
              slug: "unscheduled-post",
              contentMarkdown: "# Not ready",
              status: "scheduled",
              locale: "en",
              featured: false,
              categoryIds: [],
            }),
            {
              blogId: BlogId.make(blogId),
              keyId: ApiKeyId.make(keyId),
            },
          ),
        );

        expect(error).toBeInstanceOf(PostErrors.InvalidPost);
        expect(error.message).toMatch(/schedule time/);
        expect(executions).toBe(0);
      }).pipe(Effect.provide(Publishing.layer.pipe(Layer.provide(database))));
    },
  );
});
