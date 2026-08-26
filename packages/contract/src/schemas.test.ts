import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  postCreateInput,
  postRevisionOutput,
  postUpdateInput,
} from "./schemas.ts";

describe("post mutation schemas", () => {
  it("applies defaults to create input", () => {
    expect(
      Schema.decodeUnknownSync(postCreateInput)({
        blogId: "11111111-1111-4111-8111-111111111111",
        authorId: "22222222-2222-4222-8222-222222222222",
        title: "Draft",
        slug: "draft",
      }),
    ).toMatchObject({
      contentMarkdown: "",
      status: "draft",
      locale: "en",
      featured: false,
      categoryIds: [],
    });
  });

  it("does not inject create defaults into a partial update", () => {
    expect(
      Schema.decodeUnknownSync(postUpdateInput)({ status: "published" }),
    ).toEqual({
      status: "published",
    });
  });

  it("decodes a revision snapshot with legacy category metadata", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      Schema.decodeUnknownSync(postRevisionOutput)({
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
