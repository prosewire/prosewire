import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { toApiPostRevision } from "./api-content-models.ts";
import { toDashboardPostDetail } from "./content-models.ts";

const id = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-01T00:00:00Z");
const revision = {
  id,
  postId: id,
  editorId: null,
  version: 1,
  snapshot: {},
  createdAt: now,
};

describe("stored revision decoding", () => {
  it("returns a typed error for an unreadable API revision", async () => {
    const result = await Effect.runPromise(
      Effect.result(toApiPostRevision(revision)),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "InvalidPostRevision", revisionId: id },
    });
  });

  it("keeps current content editable when an old snapshot is malformed", async () => {
    const detail = await Effect.runPromise(
      toDashboardPostDetail({
        id,
        blogId: id,
        authorId: id,
        title: "Current draft",
        slug: "current-draft",
        excerpt: "",
        contentMarkdown: "Current content",
        contentHtml: "<p>Current content</p>",
        coverImageAssetId: null,
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
        createdById: null,
        updatedById: null,
        createdAt: now,
        updatedAt: now,
        author: {
          id,
          blogId: id,
          userId: null,
          name: "Author",
          slug: "author",
          bio: null,
          avatarUrl: null,
          jobTitle: null,
          credentials: null,
          createdAt: now,
          updatedAt: now,
        },
        categories: [],
        revisions: [revision],
      }),
    );
    expect(detail.title).toBe("Current draft");
    expect(detail.contentMarkdown).toBe("Current content");
    expect(detail.revisions).toEqual([]);
  });
});
