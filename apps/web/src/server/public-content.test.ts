import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Redacted } from "effect";
import { ContentQueries, type PublicPostOptions } from "./content-queries.ts";
import {
  testAuthor,
  testBlog,
  testCategory,
  testPostId,
  testPublicPost,
} from "./content-test-fixtures.ts";
import { WebConfig } from "./config.ts";
import { BlogSlug } from "./domain.ts";
import { PublicContent } from "./public-content.ts";

const slug = BlogSlug.make("fieldnotes");

function layer(seen: PublicPostOptions[]) {
  const dependencies = Layer.merge(
    Layer.mock(ContentQueries.Service, {
      getPublicBlog: () => Effect.succeed(testBlog),
      getPublicPosts: (_blogId, options = {}) => {
        seen.push(options);
        return Effect.succeed([testPublicPost]);
      },
      getCategories: () => Effect.succeed([testCategory]),
      getPublicPost: () => Effect.succeed(testPublicPost),
      getPublicAuthor: () => Effect.succeed(testAuthor),
      getPublicRedirect: () => Effect.succeed("new-slug"),
      recordPostView: () => Effect.succeed(true),
    }),
    Layer.succeed(WebConfig, {
      defaultBlog: "fieldnotes",
      publicUrl: "https://content.example",
      databaseUrl: Redacted.make("postgres://test"),
      authSecret: Redacted.make("test-secret-at-least-32-characters"),
      allowSignUp: false,
      smtpUrl: Option.none(),
      emailFrom: "Prosewire <prosewire@localhost>",
      environment: "test",
    }),
  );
  return PublicContent.layer.pipe(Layer.provide(dependencies));
}

describe("PublicContent", () => {
  it.effect("loads blog metadata, categories, posts, and post context", () => {
    const seen: PublicPostOptions[] = [];
    return Effect.gen(function* () {
      const service = yield* PublicContent.Service;
      const listing = yield* service.blog(slug, { category: "engineering" });
      const post = yield* service.post(slug, "published");

      expect(listing?.categories).toHaveLength(1);
      expect(listing?.posts).toHaveLength(1);
      expect(post?.publicUrl).toBe("https://content.example");
      expect(seen).toEqual([{ category: "engineering" }, {}]);
    }).pipe(Effect.provide(layer(seen)));
  });

  it.effect("filters author posts in SQL and delegates redirects and view events", () => {
    const seen: PublicPostOptions[] = [];
    return Effect.gen(function* () {
      const service = yield* PublicContent.Service;
      const author = yield* service.author(slug, "ada");
      const redirect = yield* service.redirect(slug, "old-slug");
      const accepted = yield* service.recordView(
        testPostId,
        "44444444-4444-4444-8444-444444444444",
        "direct",
      );

      expect(author?.posts).toHaveLength(1);
      expect(seen).toContainEqual({ authorId: testAuthor.id, limit: null });
      expect(redirect).toBe("new-slug");
      expect(accepted).toBe(true);
    }).pipe(Effect.provide(layer(seen)));
  });
});
