import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { BlogAccess } from "./authorization.ts";
import { BlogAuthorization } from "./authorization-models.ts";
import { ContentQueries } from "./content-queries.ts";
import {
  testAuthor,
  testBlog,
  testCategory,
  testDashboardPost,
  testDashboardPostDetail,
  testMemberId,
  testRedirect,
  testSnippet,
  testWorkspace,
} from "./content-test-fixtures.ts";
import { BlogSlug, UserId } from "./domain.ts";
import { PostExport } from "./post-export.ts";

const contentLayer = Layer.mock(ContentQueries.Service, {
  getPublicBlog: () => Effect.succeed(testBlog),
  getDashboardPosts: () => Effect.succeed([testDashboardPost]),
  getDashboardPost: () => Effect.succeed(testDashboardPostDetail),
  getContentLibrary: () =>
    Effect.succeed({
      authors: [testAuthor],
      categories: [testCategory],
      snippets: [testSnippet],
      redirects: [testRedirect],
    }),
});

const accessLayer = Layer.mock(BlogAccess.Service, {
  requireRead: () =>
    Effect.succeed(
      new BlogAuthorization({
        workspace: testWorkspace,
        blog: testBlog,
        memberId: testMemberId,
        role: "viewer",
      }),
    ),
});

const testLayer = PostExport.layer.pipe(
  Layer.provide(Layer.merge(contentLayer, accessLayer)),
);

describe("PostExport", () => {
  it.effect("returns a transport-neutral CSV file", () =>
    Effect.gen(function* () {
      const service = yield* PostExport.Service;
      const file = yield* service.csv(
        new PostExport.Input({
          blogSlug: BlogSlug.make("fieldnotes"),
          actorId: UserId.make("user-1"),
        }),
      );

      expect(file.filename).toBe("fieldnotes-posts.csv");
      expect(file.contentType).toBe("text/csv; charset=utf-8");
      expect(file.body).toContain('"\'=IMPORTXML unsafe title"');
      expect(file).not.toHaveProperty("status");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("returns a versioned portable export with revisions", () =>
    Effect.gen(function* () {
      const service = yield* PostExport.Service;
      const file = yield* service.portable(
        new PostExport.Input({
          blogSlug: BlogSlug.make("fieldnotes"),
          actorId: UserId.make("user-1"),
        }),
      );
      const body = JSON.parse(file.body) as {
        format: string;
        version: number;
        posts: Array<{ revisions: Array<{ version: number }> }>;
      };

      expect(file.filename).toBe("fieldnotes-prosewire-export.json");
      expect(body).toMatchObject({
        format: "prosewire-portable-export",
        version: 1,
      });
      expect(body.posts[0]?.revisions[0]?.version).toBe(1);
    }).pipe(Effect.provide(testLayer)),
  );
});
