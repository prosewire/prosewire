import { describe, expect, it } from "vitest";
import { serializePublicBlog, serializePublicPost } from "./serialize.ts";

describe("public serialization", () => {
  it("returns only public blog fields with ISO timestamps", () => {
    expect(
      serializePublicBlog({
        id: "blog",
        name: "Fieldnotes",
        slug: "fieldnotes",
        description: "Ideas",
        locale: "en",
        accentColor: "#fff000",
        publicUrl: null,
        createdAt: new Date("2026-08-19T00:00:00.000Z"),
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
    ).toEqual({
      id: "blog",
      name: "Fieldnotes",
      slug: "fieldnotes",
      description: "Ideas",
      locale: "en",
      accentColor: "#fff000",
      publicUrl: null,
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    });
  });

  it("serializes post relationships and derives reading time", () => {
    const post = serializePublicPost({
      id: "post",
      slug: "published",
      title: "Published",
      excerpt: "Useful",
      contentMarkdown: "word ".repeat(226),
      contentHtml: "<p>Useful</p>",
      coverImageUrl: null,
      coverImageAlt: null,
      status: "published",
      locale: "en",
      featured: false,
      publishedAt: new Date("2026-08-19T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      author: {
        id: "author",
        name: "Ada",
        slug: "ada",
        bio: null,
        avatarUrl: null,
        jobTitle: null,
        credentials: null,
      },
      categories: [
        {
          category: {
            id: "category",
            name: "Engineering",
            slug: "engineering",
            description: null,
          },
        },
      ],
    });

    expect(post.readingMinutes).toBe(2);
    expect(post.publishedAt).toBe("2026-08-19T00:00:00.000Z");
    expect(post.categories).toEqual([
      {
        id: "category",
        name: "Engineering",
        slug: "engineering",
        description: null,
      },
    ]);
  });
});
