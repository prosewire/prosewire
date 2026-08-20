import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { BlogAccess } from "./authorization.ts";
import { ContentQueries } from "./content-queries.ts";
import { BlogSlug, UserId } from "./domain.ts";
import { PostExport } from "./post-export.ts";

const blog = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "fieldnotes",
};

const contentLayer = Layer.mock(ContentQueries.Service, {
  getPublicBlog: () => Effect.succeed(blog as never),
  getDashboardPosts: () =>
    Effect.succeed([
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "=IMPORTXML unsafe title",
        slug: "effect-properly",
        status: "published",
        locale: "en",
        author: { name: "Ada" },
        categories: [{ category: { name: "Engineering" } }],
        excerpt: "A useful post",
        contentMarkdown: "# Effect",
        seoTitle: null,
        seoDescription: null,
        publishedAt: new Date("2026-08-20T00:00:00.000Z"),
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      },
    ] as never),
  getDashboardPost: () =>
    Effect.succeed({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Effect, properly",
      revisions: [{ version: 1, snapshot: { title: "Earlier" } }],
    } as never),
  getContentLibrary: () =>
    Effect.succeed({
      authors: [{ id: "author-1", name: "Ada" }],
      categories: [{ id: "category-1", name: "Engineering" }],
      snippets: [{ id: "snippet-1", key: "cta" }],
      redirects: [{ id: "redirect-1", fromPath: "old" }],
    } as never),
});

const accessLayer = Layer.mock(BlogAccess.Service, {
  requireRead: () => Effect.succeed({ role: "viewer" } as never),
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
