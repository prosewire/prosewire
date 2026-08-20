import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted, Schema } from "effect";
import type { Db } from "@prosewire/db/client";
import * as databaseSchema from "@prosewire/db/schema";
import { ApiContent } from "./api-content.ts";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { Database } from "./database.ts";
import {
  ApiKeyId,
  AuthorId,
  BlogId,
  CategoryId,
  PostId,
  UserId,
} from "./domain.ts";
import { PostErrors } from "./post-errors.ts";
import {
  ApiCreatePostInput,
  Publishing,
  SavePostInput,
} from "./publishing.ts";

const blogId = "11111111-1111-4111-8111-111111111111";
const authorId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const keyId = "44444444-4444-4444-8444-444444444444";

describe("Publishing inputs", () => {
  it.effect("decodes external identifiers and dates into the domain command", () =>
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

describe("Publishing transitions", () => {
  it.effect("rejects a scheduled API post before rendering or persistence", () => {
    let executions = 0;
    const dependencies = Layer.mergeAll(
      Layer.mock(Database, {
        execute: () => {
          executions += 1;
          return Effect.die("database should not be called");
        },
      }),
      Layer.succeed(WebConfig, {
        defaultBlog: "fieldnotes",
        publicUrl: "http://localhost:3000",
        databaseUrl: Redacted.make("postgres://test"),
        authSecret: Redacted.make("test-secret-at-least-32-characters"),
      }),
      Layer.mock(BlogAccess.Service, {}),
      Layer.mock(ApiContent.Service, {}),
    );

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
    }).pipe(
      Effect.provide(Publishing.layer.pipe(Layer.provide(dependencies))),
    );
  });

  it.effect("preserves the original publication time when editing a live post", () => {
    const postId = "55555555-5555-4555-8555-555555555555";
    const actorId = UserId.make("editor-1");
    const publishedAt = new Date("2026-08-01T09:00:00.000Z");
    const existing = {
      id: postId,
      blogId,
      authorId,
      slug: "published-post",
      status: "published" as const,
      publishedAt,
    };
    let updated: Record<string, unknown> | undefined;
    const transaction = {
      select: () => ({
        from: (table: unknown) => ({
          where: () =>
            table === databaseSchema.author
              ? Promise.resolve([{ id: authorId }])
              : {
                  for: () => Promise.resolve([existing]),
                },
        }),
      }),
      query: {
        postRevision: {
          findFirst: () => Promise.resolve({ version: 1 }),
        },
      },
      insert: () => ({
        values: () => Promise.resolve(),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            updated = values;
            return Promise.resolve();
          },
        }),
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
    };
    const client = {
      transaction: async (
        evaluate: (tx: typeof transaction) => Promise<unknown>,
      ) => await evaluate(transaction),
    } as unknown as Db;
    const dependencies = Layer.mergeAll(
      Layer.succeed(Database, {
        client: Effect.succeed(client),
        execute: (operation, evaluate) =>
          Effect.tryPromise({
            try: () => evaluate(client),
            catch: (cause) =>
              new Error(`${operation}: ${String(cause)}`) as never,
          }),
      }),
      Layer.succeed(WebConfig, {
        defaultBlog: "fieldnotes",
        publicUrl: "http://localhost:3000",
        databaseUrl: Redacted.make("postgres://test"),
        authSecret: Redacted.make("test-secret-at-least-32-characters"),
      }),
      Layer.mock(BlogAccess.Service, {
        requirePostWrite: () => Effect.succeed({ role: "editor" } as never),
      }),
      Layer.mock(ApiContent.Service, {}),
    );

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      yield* publishing.savePost(
        new SavePostInput({
          id: PostId.make(postId),
          blogId: BlogId.make(blogId),
          authorId: AuthorId.make(authorId),
          title: "Published post, edited",
          requestedSlug: "published-post",
          excerpt: "Edited",
          contentMarkdown: "# Edited",
          requestedStatus: "published",
          featured: false,
          locale: "en",
          coverImageUrl: null,
          coverImageAlt: null,
          seoTitle: null,
          seoDescription: null,
          focusKeyword: null,
          canonicalUrl: null,
          scheduledAt: null,
        }),
        actorId,
      );

      expect(updated?.["publishedAt"]).toBe(publishedAt);
    }).pipe(
      Effect.provide(Publishing.layer.pipe(Layer.provide(dependencies))),
    );
  });

  it.effect("records a revision before archiving through the API", () => {
    const postId = "55555555-5555-4555-8555-555555555555";
    const events: Array<string> = [];
    const existing = {
      id: postId,
      blogId,
      status: "published" as const,
      title: "Published post",
      slug: "published-post",
    };
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => Promise.resolve([existing]),
          }),
        }),
      }),
      query: {
        postRevision: {
          findFirst: () => Promise.resolve({ version: 3 }),
        },
      },
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          events.push(
            table === databaseSchema.postRevision ? "revision" : "audit",
          );
          if (table === databaseSchema.postRevision) {
            expect(values).toMatchObject({
              postId,
              version: 4,
              snapshot: existing,
            });
          }
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: (values: unknown) => ({
          where: () => {
            events.push("archive");
            expect(values).toMatchObject({ status: "archived" });
            return Promise.resolve();
          },
        }),
      }),
    };
    const client = {
      transaction: async (
        evaluate: (tx: typeof transaction) => Promise<unknown>,
      ) => await evaluate(transaction),
    } as unknown as Db;
    const dependencies = Layer.mergeAll(
      Layer.succeed(Database, {
        client: Effect.succeed(client),
        execute: (operation, evaluate) =>
          Effect.tryPromise({
            try: () => evaluate(client),
            catch: (cause) =>
              new Error(`${operation}: ${String(cause)}`) as never,
          }),
      }),
      Layer.succeed(WebConfig, {
        defaultBlog: "fieldnotes",
        publicUrl: "http://localhost:3000",
        databaseUrl: Redacted.make("postgres://test"),
        authSecret: Redacted.make("test-secret-at-least-32-characters"),
      }),
      Layer.mock(BlogAccess.Service, {}),
      Layer.mock(ApiContent.Service, {}),
    );

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const result = yield* publishing.archiveApiPost(PostId.make(postId), {
        blogId: BlogId.make(blogId),
        keyId: ApiKeyId.make(keyId),
      });

      expect(result).toEqual({ ok: true });
      expect(events).toEqual(["revision", "archive", "audit"]);
    }).pipe(
      Effect.provide(Publishing.layer.pipe(Layer.provide(dependencies))),
    );
  });
});
