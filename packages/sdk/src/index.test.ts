import { describe, expect, it, vi } from "vitest";
import { createClient, createPublicClient } from "./index.ts";

const blog = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Field Notes",
  slug: "field-notes",
  description: "Portable publishing",
  locale: "en",
  accentColor: "#ef6848",
  publicUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const post = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "published",
  title: "Published",
  excerpt: "An excerpt",
  contentMarkdown: "# Published",
  contentHtml: "<h1>Published</h1>",
  coverImageUrl: null,
  coverImageAlt: null,
  status: "published",
  locale: "en",
  featured: false,
  publishedAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  readingMinutes: 1,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  author: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Ada",
    slug: "ada",
    bio: null,
    avatarUrl: null,
    jobTitle: null,
    credentials: null,
  },
  categories: [],
} as const;

const privatePost = {
  ...post,
  blogId: blog.id,
  focusKeyword: null,
  scheduledAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("Prosewire SDK", () => {
  it("calls the typed API with a normalized URL and bearer key", async () => {
    const request = vi.fn((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(url).toBe(
        "https://content.example/api/v1/blogs",
      );
      expect(headers.get("authorization")).toBe("Bearer pw_test_key");
      return Promise.resolve(Response.json([]));
    });
    const client = createClient({
      baseUrl: "https://content.example/",
      apiKey: "pw_test_key",
      fetch: request,
    });

    await expect(client.blogs.list()).resolves.toEqual([]);
    expect(request).toHaveBeenCalledOnce();
  });

  it("exposes every private API operation through the Promise facade", async () => {
    const requests: Request[] = [];
    const request = vi.fn((
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      const outgoing = input instanceof Request ? input : new Request(input, init);
      requests.push(outgoing);
      const url = new URL(outgoing.url);

      if (url.pathname.endsWith("/health")) {
        return Promise.resolve(Response.json({ status: "ok", version: "1.0.0" }));
      }
      if (outgoing.method === "GET" && url.pathname.endsWith("/posts")) {
        return Promise.resolve(Response.json({
          items: [privatePost],
          total: 1,
          page: 2,
          pageSize: 10,
        }));
      }
      if (outgoing.method === "DELETE") {
        return Promise.resolve(Response.json({ ok: true }));
      }
      return Promise.resolve(Response.json(privatePost));
    });
    const client = createClient({
      baseUrl: "https://content.example",
      fetch: request,
    });

    await expect(client.health()).resolves.toEqual({ status: "ok", version: "1.0.0" });
    await expect(client.posts.list({ status: "draft", page: 2, pageSize: 10 }))
      .resolves.toMatchObject({ total: 1, page: 2, pageSize: 10 });
    await expect(client.posts.get({ params: { id: privatePost.id } }))
      .resolves.toMatchObject({ id: privatePost.id });
    await expect(client.posts.create({
      blogId: blog.id,
      authorId: privatePost.author.id,
      title: "Draft",
      slug: "draft",
    })).resolves.toMatchObject({ id: privatePost.id });
    await expect(client.posts.update({
      params: { id: privatePost.id },
      body: { title: "Updated" },
    })).resolves.toMatchObject({ id: privatePost.id });
    await expect(client.posts.archive({ params: { id: privatePost.id } }))
      .resolves.toEqual({ ok: true });

    expect(requests.map(({ method }) => method)).toEqual([
      "GET", "GET", "GET", "POST", "PATCH", "DELETE",
    ]);
    expect(requests[1]?.url).toContain("status=draft&page=2&pageSize=10");
    await expect(requests[3]?.json()).resolves.toMatchObject({
      contentMarkdown: "",
      status: "draft",
      locale: "en",
      featured: false,
      categoryIds: [],
    });
  });

  it("queries every public content endpoint and encodes user input", async () => {
    const requestedUrls: string[] = [];
    const request = vi.fn((input: Parameters<typeof fetch>[0]) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requestedUrls.push(url);
      if (url.includes("/api/rendered/")) {
        return Promise.resolve(new Response("<article>Published</article>"));
      }
      if (url.endsWith("/a%2Fb")) {
        return Promise.resolve(Response.json({ blog, post }));
      }
      return Promise.resolve(Response.json({
        blog,
        posts: [post],
        categories: [],
        pagination: { page: 2, pageSize: 12, hasMore: false },
      }));
    });
    const client = createPublicClient({
      baseUrl: "https://content.example/",
      blog: "field notes",
      fetch: request,
    });

    const listing = await client.listPosts({
      search: "portable content",
      category: "engineering",
      page: 2,
      pageSize: 12,
    });
    expect(listing.posts[0]?.title).toBe("Published");
    expect(requestedUrls[0]).toContain(
      "/api/public/field%20notes/posts?search=portable+content&category=engineering&page=2&pageSize=12",
    );
    const result = await client.getPost("a/b");
    expect(result.post.slug).toBe("published");
    expect(requestedUrls[1]).toBe(
      "https://content.example/api/public/field%20notes/posts/a%2Fb",
    );
    await expect(client.getRendered("/a story")).resolves.toContain("Published");
  });

  it("rejects malformed public API responses", async () => {
    const client = createPublicClient({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
      fetch: vi.fn().mockResolvedValue(Response.json({ posts: [] })),
    });

    await expect(client.listPosts()).rejects.toThrow();
  });

  it("throws useful errors for failed public requests", async () => {
    const client = createPublicClient({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
      fetch: vi.fn().mockResolvedValue(new Response("missing", { status: 404 })),
    });

    await expect(client.listPosts()).rejects.toThrow("Prosewire request failed (404)");
    await expect(client.getPost("missing")).rejects.toThrow("Prosewire request failed (404)");
    await expect(client.getRendered()).rejects.toThrow("Prosewire request failed (404)");
  });
});
