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
        title: "Effect, properly",
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
      expect(file.body).toContain('"Effect, properly"');
      expect(file).not.toHaveProperty("status");
    }).pipe(Effect.provide(testLayer)),
  );
});
