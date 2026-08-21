import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Redacted, Schema } from "effect";
import type { Db } from "@prosewire/db/client";
import * as databaseSchema from "@prosewire/db/schema";
import { ApiAccess } from "./api-access.ts";
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

const authorizationRow = {
  blog: {
    id: blogId,
    organizationId: "workspace-1",
    name: "Fieldnotes",
    slug: "fieldnotes",
    description: "",
    locale: "en",
    accentColor: "#f06445",
    customCss: "",
    publicUrl: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  workspace: {
    id: "workspace-1",
    name: "Studio",
    slug: "studio",
    logo: null,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  memberId: "member-1",
  role: "editor",
};

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
        allowSignUp: false,
        smtpUrl: Option.none(),
        emailFrom: "Prosewire <prosewire@localhost>",
        environment: "test",
      }),
      Layer.mock(BlogAccess.Service, {}),
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
        from: (table: unknown) =>
          table === databaseSchema.blog
            ? {
                innerJoin: () => ({
                  innerJoin: () => ({
                    where: () => ({
                      for: () => Promise.resolve([authorizationRow]),
                    }),
                  }),
                }),
              }
            : {
                where: () =>
                  table === databaseSchema.author
                    ? Promise.resolve([{ id: authorId }])
                    : {
                        for: () => Promise.resolve([existing]),
                      },
              },
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
      query: {
        post: { findFirst: () => Promise.resolve(existing) },
      },
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
        allowSignUp: false,
        smtpUrl: Option.none(),
        emailFrom: "Prosewire <prosewire@localhost>",
        environment: "test",
      }),
      Layer.mock(BlogAccess.Service, {
        requirePostUpdate: () =>
          Effect.succeed({
            role: "editor",
            workspace: { id: "workspace-1" },
            blog: { slug: "fieldnotes" },
          } as never),
        requirePublish: () =>
          Effect.succeed({
            role: "editor",
            workspace: { id: "workspace-1" },
            blog: { slug: "fieldnotes" },
          } as never),
      }),
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

  it.effect("requires publish permission before taking a live post back to draft", () => {
    const postId = "55555555-5555-4555-8555-555555555555";
    const actorId = UserId.make("author-1");
    const existing = {
      id: postId,
      blogId,
      authorId,
      createdById: actorId,
      slug: "published-post",
      status: "published" as const,
    };
    let executions = 0;
    let writes = 0;
    const transaction = {
      select: () => ({
        from: (table: unknown) =>
          table === databaseSchema.blog
            ? {
                innerJoin: () => ({
                  innerJoin: () => ({
                    where: () => ({
                      for: () =>
                        Promise.resolve([
                          { ...authorizationRow, role: "author" },
                        ]),
                    }),
                  }),
                }),
              }
            : {
                where: () =>
                  table === databaseSchema.author
                    ? Promise.resolve([{ id: authorId }])
                    : { for: () => Promise.resolve([existing]) },
              },
      }),
      insert: () => {
        writes += 1;
        return { values: () => Promise.resolve() };
      },
      update: () => {
        writes += 1;
        return { set: () => ({ where: () => Promise.resolve() }) };
      },
      delete: () => {
        writes += 1;
        return { where: () => Promise.resolve() };
      },
    };
    const client = {
      transaction: async (
        evaluate: (tx: typeof transaction) => Promise<unknown>,
      ) => await evaluate(transaction),
    } as unknown as Db;
    const dependencies = Layer.mergeAll(
      Layer.succeed(Database, {
        client: Effect.succeed(client),
        execute: (operation, evaluate) => {
          executions += 1;
          return Effect.tryPromise({
            try: () => evaluate(client),
            catch: (cause) =>
              new Error(`${operation}: ${String(cause)}`) as never,
          });
        },
      }),
      Layer.succeed(WebConfig, {
        defaultBlog: "fieldnotes",
        publicUrl: "http://localhost:3000",
        databaseUrl: Redacted.make("postgres://test"),
        authSecret: Redacted.make("test-secret-at-least-32-characters"),
        allowSignUp: false,
        smtpUrl: Option.none(),
        emailFrom: "Prosewire <prosewire@localhost>",
        environment: "test",
      }),
      Layer.mock(BlogAccess.Service, {}),
    );

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const error = yield* Effect.flip(
        publishing.savePost(
          new SavePostInput({
            id: PostId.make(postId),
            blogId: BlogId.make(blogId),
            authorId: AuthorId.make(authorId),
            title: "Back to draft",
            requestedSlug: "back-to-draft",
            excerpt: "",
            contentMarkdown: "# Draft",
            requestedStatus: "draft",
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
        ),
      );

      expect(error).toBeInstanceOf(BlogAccess.BlogAccessDenied);
      if (error instanceof BlogAccess.BlogAccessDenied) {
        expect(error.capability).toBe("content:publish");
      }
      expect(executions).toBe(1);
      expect(writes).toBe(0);
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
        from: (table: unknown) =>
          table === databaseSchema.apiKey
            ? {
                innerJoin: () => ({
                  where: () => ({
                    for: () =>
                      Promise.resolve([
                        {
                          key: {
                            id: keyId,
                            blogId,
                            scopes: ["content:read", "content:write"],
                            expiresAt: null,
                          },
                          organizationId: "workspace-1",
                        },
                      ]),
                  }),
                }),
              }
            : {
                where: () => ({
                  for: () => Promise.resolve([existing]),
                }),
              },
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
      query: {
        blog: {
          findFirst: () => Promise.resolve({ organizationId: "workspace-1" }),
        },
      },
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
        allowSignUp: false,
        smtpUrl: Option.none(),
        emailFrom: "Prosewire <prosewire@localhost>",
        environment: "test",
      }),
      Layer.mock(BlogAccess.Service, {}),
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

  it.effect("rejects an API mutation when its key was revoked before the transaction", () => {
    let writes = 0;
    const transaction = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              for: () => Promise.resolve([]),
            }),
          }),
        }),
      }),
      insert: () => {
        writes += 1;
        throw new Error("revoked keys must not write");
      },
      update: () => {
        writes += 1;
        throw new Error("revoked keys must not write");
      },
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
        allowSignUp: false,
        smtpUrl: Option.none(),
        emailFrom: "Prosewire <prosewire@localhost>",
        environment: "test",
      }),
      Layer.mock(BlogAccess.Service, {}),
    );

    return Effect.gen(function* () {
      const publishing = yield* Publishing.Service;
      const error = yield* Effect.flip(
        publishing.archiveApiPost(
          PostId.make("55555555-5555-4555-8555-555555555555"),
          {
            blogId: BlogId.make(blogId),
            keyId: ApiKeyId.make(keyId),
          },
        ),
      );

      expect(error).toBeInstanceOf(ApiAccess.AuthenticationFailed);
      expect(writes).toBe(0);
    }).pipe(
      Effect.provide(Publishing.layer.pipe(Layer.provide(dependencies))),
    );
  });
});
