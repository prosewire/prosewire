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
import { Effect, Layer, Option, Redacted, Schema } from "effect";
import { ApiAccess } from "./api-access.ts";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { testDatabaseLayer } from "./database.test-support.ts";
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
import { ApiCreatePostInput, Publishing, SavePostInput } from "./publishing.ts";

const databaseUrl = process.env.DATABASE_URL;
const blogId = "11111111-1111-4111-8111-111111111111";
const authorId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const keyId = "44444444-4444-4444-8444-444444444444";
const postId = "55555555-5555-4555-8555-555555555555";

function configLayer(url = "postgres://test") {
  return Layer.succeed(WebConfig, {
    defaultBlog: "fieldnotes",
    publicUrl: "http://localhost:3000",
    databaseUrl: Redacted.make(url),
    authSecret: Redacted.make("test-secret-at-least-32-characters"),
    allowSignUp: false,
    smtpUrl: Option.none(),
    emailFrom: "Prosewire <prosewire@localhost>",
    environment: "test",
  });
}

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
      const dependencies = Layer.mergeAll(
        Layer.mock(Database, {
          execute: () => {
            executions += 1;
            return Effect.die("database should not be called");
          },
        }),
        configLayer(),
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
        Effect.provide(Publishing.live.pipe(Layer.provide(dependencies))),
      );
    },
  );
});

describe.skipIf(!databaseUrl)("Publishing transitions with PostgreSQL", () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    testDatabase = await openTestDatabase(databaseUrl, "web_publishing");
  });

  beforeEach(async () => {
    await testDatabase.reset();
  });

  afterAll(async () => {
    await testDatabase?.close();
  });

  const seedPublication = async (
    role: "owner" | "admin" | "editor" | "author" | "viewer" = "editor",
    actorId = "editor-1",
  ) => {
    await testDatabase.client.insert(schema.user).values({
      id: actorId,
      email: `${actorId}@example.com`,
      name: "Editor",
    });
    await testDatabase.client.insert(schema.organization).values({
      id: "workspace-1",
      name: "Studio",
      slug: "studio",
    });
    await testDatabase.client.insert(schema.member).values({
      id: "member-1",
      organizationId: "workspace-1",
      userId: actorId,
      role,
    });
    await testDatabase.client.insert(schema.blog).values({
      id: blogId,
      organizationId: "workspace-1",
      name: "Fieldnotes",
      slug: "fieldnotes",
    });
    await testDatabase.client.insert(schema.author).values({
      id: authorId,
      blogId,
      name: "Author",
      slug: "author",
      userId: actorId,
    });
  };

  const seedPublishedPost = async (
    actorId: string,
    publishedAt = new Date("2026-08-01T09:00:00.000Z"),
  ) => {
    await testDatabase.client.insert(schema.post).values({
      id: postId,
      blogId,
      authorId,
      title: "Published post",
      slug: "published-post",
      contentMarkdown: "# Published",
      contentHtml: "<h1>Published</h1>",
      status: "published",
      publishedAt,
      createdById: actorId,
      updatedById: actorId,
    });
  };

  const layer = () =>
    Publishing.live.pipe(
      Layer.provide(
        Layer.mergeAll(
          testDatabaseLayer(testDatabase.client),
          configLayer(testDatabase.url),
          Layer.mock(BlogAccess.Service, {}),
        ),
      ),
    );

  it.effect(
    "preserves the original publication time when editing a live post",
    () =>
      Effect.gen(function* () {
        const actorId = UserId.make("editor-1");
        const publishedAt = new Date("2026-08-01T09:00:00.000Z");
        yield* Effect.promise(async () => {
          await seedPublication("editor", actorId);
          await seedPublishedPost(actorId, publishedAt);
        });

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

        const persisted = yield* Effect.promise(() =>
          testDatabase.client.query.post.findFirst({
            where: eq(schema.post.id, postId),
          }),
        );
        const revisions = yield* Effect.promise(() =>
          testDatabase.client.query.postRevision.findMany({
            where: eq(schema.postRevision.postId, postId),
          }),
        );
        expect(persisted?.publishedAt).toEqual(publishedAt);
        expect(revisions).toHaveLength(1);
      }).pipe(Effect.provide(layer())),
  );

  it.effect(
    "requires publish permission before taking a live post back to draft",
    () =>
      Effect.gen(function* () {
        const actorId = UserId.make("author-1");
        yield* Effect.promise(async () => {
          await seedPublication("author", actorId);
          await seedPublishedPost(actorId);
        });

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
        const persisted = yield* Effect.promise(() =>
          testDatabase.client.query.post.findFirst({
            where: eq(schema.post.id, postId),
          }),
        );
        const revisions = yield* Effect.promise(() =>
          testDatabase.client.query.postRevision.findMany(),
        );
        expect(persisted?.status).toBe("published");
        expect(revisions).toHaveLength(0);
      }).pipe(Effect.provide(layer())),
  );

  it.effect("records a revision before archiving through the API", () =>
    Effect.gen(function* () {
      yield* Effect.promise(async () => {
        await seedPublication();
        await seedPublishedPost("editor-1");
        await testDatabase.client.insert(schema.apiKey).values({
          id: keyId,
          blogId,
          name: "Writer",
          prefix: "pw_test",
          keyHash: "unused-in-this-test",
          scopes: ["content:read", "content:write"],
        });
      });

      const publishing = yield* Publishing.Service;
      const result = yield* publishing.archiveApiPost(PostId.make(postId), {
        blogId: BlogId.make(blogId),
        keyId: ApiKeyId.make(keyId),
      });

      expect(result).toEqual({ ok: true });
      const persisted = yield* Effect.promise(() =>
        testDatabase.client.query.post.findFirst({
          where: eq(schema.post.id, postId),
        }),
      );
      const revisions = yield* Effect.promise(() =>
        testDatabase.client.query.postRevision.findMany(),
      );
      const audits = yield* Effect.promise(() =>
        testDatabase.client.query.auditLog.findMany(),
      );
      expect(persisted?.status).toBe("archived");
      expect(revisions).toHaveLength(1);
      expect(revisions[0]?.snapshot).toMatchObject({ status: "published" });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe("post.archived");
    }).pipe(Effect.provide(layer())),
  );

  it.effect(
    "rejects an API mutation when its key was revoked before the transaction",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await seedPublication();
          await seedPublishedPost("editor-1");
        });

        const publishing = yield* Publishing.Service;
        const error = yield* Effect.flip(
          publishing.archiveApiPost(PostId.make(postId), {
            blogId: BlogId.make(blogId),
            keyId: ApiKeyId.make(keyId),
          }),
        );

        expect(error).toBeInstanceOf(ApiAccess.AuthenticationFailed);
        const persisted = yield* Effect.promise(() =>
          testDatabase.client.query.post.findFirst({
            where: eq(schema.post.id, postId),
          }),
        );
        const revisions = yield* Effect.promise(() =>
          testDatabase.client.query.postRevision.findMany(),
        );
        const audits = yield* Effect.promise(() =>
          testDatabase.client.query.auditLog.findMany(),
        );
        expect(persisted?.status).toBe("published");
        expect(revisions).toHaveLength(0);
        expect(audits).toHaveLength(0);
      }).pipe(Effect.provide(layer())),
  );
});
