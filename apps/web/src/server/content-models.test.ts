import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { PostRevision, Redirect } from "./content-models.ts";

const nonFiniteNumbers = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

describe("content model numeric schemas", () => {
  it.each(nonFiniteNumbers)(
    "rejects a non-finite revision version",
    (version) => {
      expect(() =>
        Schema.decodeSync(PostRevision)({
          id: "11111111-1111-4111-8111-111111111111",
          postId: "22222222-2222-4222-8222-222222222222",
          editorId: null,
          version,
          snapshot: {
            authorId: "33333333-3333-4333-8333-333333333333",
            title: "Earlier",
            slug: "earlier",
            excerpt: "Earlier excerpt",
            contentMarkdown: "# Earlier",
            contentHtml: "<h1>Earlier</h1>",
            coverImageUrl: null,
            coverImageAlt: null,
            status: "draft",
            locale: "en",
            featured: false,
            seoTitle: null,
            seoDescription: null,
            focusKeyword: null,
            canonicalUrl: null,
            scheduledAt: null,
            publishedAt: null,
            archivedAt: null,
            categoryIds: [],
          },
          createdAt: new Date("2026-08-26T10:00:00.000Z"),
        }),
      ).toThrow();
    },
  );

  it.each(nonFiniteNumbers)(
    "rejects a non-finite redirect status code",
    (statusCode) => {
      expect(() =>
        Schema.decodeSync(Redirect)({
          id: "33333333-3333-4333-8333-333333333333",
          blogId: "44444444-4444-4444-8444-444444444444",
          fromPath: "old",
          toPath: "new",
          statusCode,
          createdAt: new Date("2026-08-26T10:00:00.000Z"),
        }),
      ).toThrow();
    },
  );
});
