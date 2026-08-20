import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Redacted } from "effect";
import { ContentQueries, type PublicPostOptions } from "./content-queries.ts";
import { WebConfig } from "./config.ts";
import { AuthorId, BlogId, BlogSlug, PostId } from "./domain.ts";
import { PublicContent } from "./public-content.ts";

const blogId = BlogId.make("11111111-1111-4111-8111-111111111111");
const postId = PostId.make("22222222-2222-4222-8222-222222222222");
const authorId = AuthorId.make("33333333-3333-4333-8333-333333333333");
const slug = BlogSlug.make("fieldnotes");

function layer(seen: PublicPostOptions[]) {
  const dependencies = Layer.merge(
    Layer.mock(ContentQueries.Service, {
      getPublicBlog: () => Effect.succeed({ id: blogId } as never),
      getPublicPosts: (_blogId, options = {}) => {
        seen.push(options);
        return Effect.succeed([{ id: postId }] as never);
      },
      getCategories: () => Effect.succeed([{ slug: "engineering" }] as never),
      getPublicPost: () => Effect.succeed({ id: postId } as never),
      getPublicAuthor: () =>
        Effect.succeed({ id: authorId, slug: "ada" } as never),
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
        postId,
        "44444444-4444-4444-8444-444444444444",
        "direct",
      );

      expect(author?.posts).toHaveLength(1);
      expect(seen).toContainEqual({ authorId, limit: null });
      expect(redirect).toBe("new-slug");
      expect(accepted).toBe(true);
    }).pipe(Effect.provide(layer(seen)));
  });
});
