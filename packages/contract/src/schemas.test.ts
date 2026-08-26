import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  postCreateInput,
  postRevisionOutput,
  postUpdateInput,
  publicPostOutput,
} from "./schemas.ts";

const publicPost = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "published-post",
  title: "Published post",
  excerpt: "",
  contentMarkdown: "# Published",
  contentHtml: "<h1>Published</h1>",
  coverImageUrl: null,
  coverImageAlt: null,
  status: "published" as const,
  locale: "en",
  featured: false,
  publishedAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z",
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  author: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Author",
    slug: "author",
    bio: null,
    avatarUrl: null,
    jobTitle: null,
    credentials: null,
  },
  categories: [],
};

describe("post mutation schemas", () => {
  it("applies defaults to create input", () => {
    expect(
      Schema.decodeSync(postCreateInput)({
        blogId: "11111111-1111-4111-8111-111111111111",
        authorId: "22222222-2222-4222-8222-222222222222",
        title: "Draft",
        slug: "draft",
      }),
    ).toMatchObject({
      contentMarkdown: "",
      status: "draft",
      featured: false,
      categoryIds: [],
    });
  });

  it("does not inject create defaults into a partial update", () => {
    expect(Schema.decodeSync(postUpdateInput)({ status: "published" })).toEqual(
      {
        status: "published",
      },
    );
  });

  it("decodes a revision snapshot with legacy category metadata", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      Schema.decodeSync(postRevisionOutput)({
        id,
        postId: id,
        editorId: null,
        version: 1,
        createdAt: "2026-08-26T10:00:00.000Z",
        snapshot: {
          authorId: id,
          title: "Earlier",
          slug: "earlier",
          excerpt: "Earlier draft",
          contentMarkdown: "# Earlier",
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
          categoryIds: null,
        },
      }),
    ).toMatchObject({ version: 1, snapshot: { categoryIds: null } });
  });
});

describe("public post schemas", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a non-finite reading time",
    (readingMinutes) => {
      expect(() =>
        Schema.decodeSync(publicPostOutput)({
          ...publicPost,
          readingMinutes,
        }),
      ).toThrow();
    },
  );
});
