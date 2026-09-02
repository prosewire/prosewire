import { describe, expect, it, vi } from "vitest";
import {
  createClient,
  createPublicClient,
  type ProsewireRequestError,
} from "./index.ts";

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
  coverImageAssetId: null,
  focusKeyword: null,
  scheduledAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const revision = {
  id: "44444444-4444-4444-8444-444444444444",
  postId: privatePost.id,
  editorId: null,
  version: 1,
  createdAt: "2026-01-03T00:00:00.000Z",
  snapshot: {
    authorId: privatePost.author.id,
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
    categoryIds: [],
  },
} as const;

const mediaAsset = {
  id: "55555555-5555-4555-8555-555555555555",
  blogId: blog.id,
  filename: "cover.webp",
  mimeType: "image/webp",
  byteSize: 1_024,
  storageBytes: 2_048,
  width: 1_600,
  height: 900,
  checksumSha256:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  status: "ready" as const,
  url: "https://media.example/cover.webp",
  variants: [
    {
      kind: "large" as const,
      url: "https://media.example/cover.webp",
      mimeType: "image/webp",
      byteSize: 1_024,
      width: 1_600,
      height: 900,
      checksumSha256:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  ],
  references: [],
  uploadedAt: "2026-01-03T00:00:00.000Z",
  backedUpAt: null,
  createdAt: "2026-01-03T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

describe("Prosewire SDK", () => {
  it("calls the typed API with a normalized URL and bearer key", async () => {
    const request = vi.fn(
      (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const headers = new Headers(
          input instanceof Request ? input.headers : init?.headers,
        );
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        expect(url).toBe("https://content.example/api/v1/blogs");
        expect(headers.get("authorization")).toBe("Bearer pw_test_key");
        return Promise.resolve(Response.json([]));
      },
    );
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
    const request = vi.fn(
      (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const outgoing =
          input instanceof Request ? input : new Request(input, init);
        requests.push(outgoing);
        const url = new URL(outgoing.url);

        if (url.pathname.endsWith("/health")) {
          return Promise.resolve(
            Response.json({ status: "ok", version: "1.0.0" }),
          );
        }
        if (outgoing.method === "GET" && url.pathname.endsWith("/posts")) {
          return Promise.resolve(
            Response.json({
              items: [privatePost],
              total: 1,
              page: 2,
              pageSize: 10,
            }),
          );
        }
        if (outgoing.method === "GET" && url.pathname.endsWith("/revisions")) {
          return Promise.resolve(Response.json([revision]));
        }
        if (outgoing.method === "GET" && url.pathname.endsWith("/media")) {
          return Promise.resolve(
            Response.json({
              items: [mediaAsset],
              usage: {
                usedBytes: 2_048,
                quotaBytes: 4_096,
                remainingBytes: 2_048,
              },
              configured: true,
              backupConfigured: true,
              maxUploadBytes: 20_971_520,
            }),
          );
        }
        if (
          outgoing.method === "POST" &&
          url.pathname.endsWith("/media/uploads")
        ) {
          return Promise.resolve(
            Response.json(
              {
                asset: { ...mediaAsset, status: "pending", url: null },
                upload: {
                  url: "https://storage.example/signed",
                  method: "PUT",
                  headers: { "content-type": "image/webp" },
                  expiresAt: "2026-01-03T00:10:00.000Z",
                },
                usage: {
                  usedBytes: 1_024,
                  quotaBytes: 4_096,
                  remainingBytes: 3_072,
                },
              },
              { status: 201 },
            ),
          );
        }
        if (url.pathname.includes("/media/")) {
          return outgoing.method === "DELETE"
            ? Promise.resolve(Response.json({ ok: true }))
            : Promise.resolve(Response.json(mediaAsset));
        }
        if (outgoing.method === "DELETE") {
          return Promise.resolve(Response.json({ ok: true }));
        }
        return Promise.resolve(Response.json(privatePost));
      },
    );
    const client = createClient({
      baseUrl: "https://content.example",
      fetch: request,
    });

    await expect(client.health()).resolves.toEqual({
      status: "ok",
      version: "1.0.0",
    });
    await expect(
      client.posts.list({ status: "draft", page: 2, pageSize: 10 }),
    ).resolves.toMatchObject({ total: 1, page: 2, pageSize: 10 });
    await expect(
      client.posts.get({ params: { id: privatePost.id } }),
    ).resolves.toMatchObject({ id: privatePost.id });
    await expect(
      client.posts.revisions({ params: { id: privatePost.id } }),
    ).resolves.toEqual([revision]);
    await expect(
      client.posts.create({
        blogId: blog.id,
        authorId: privatePost.author.id,
        title: "Draft",
        slug: "draft",
      }),
    ).resolves.toMatchObject({ id: privatePost.id });
    await expect(
      client.posts.update({
        params: { id: privatePost.id },
        body: { title: "Updated" },
      }),
    ).resolves.toMatchObject({ id: privatePost.id });
    await expect(
      client.posts.archive({ params: { id: privatePost.id } }),
    ).resolves.toEqual({ ok: true });
    await expect(
      client.posts.restore({
        params: { id: privatePost.id, revisionId: revision.id },
      }),
    ).resolves.toMatchObject({ id: privatePost.id });
    await expect(client.media.list()).resolves.toMatchObject({
      items: [{ id: mediaAsset.id }],
      configured: true,
    });
    await expect(
      client.media.get({ params: { id: mediaAsset.id } }),
    ).resolves.toMatchObject({ id: mediaAsset.id });
    await expect(
      client.media.startUpload({
        blogId: blog.id,
        filename: "cover.webp",
        mimeType: "image/webp",
        byteSize: 1_024,
      }),
    ).resolves.toMatchObject({ upload: { method: "PUT" } });
    await expect(
      client.media.completeUpload({ params: { id: mediaAsset.id } }),
    ).resolves.toMatchObject({ id: mediaAsset.id });
    await expect(
      client.media.backup({ params: { id: mediaAsset.id } }),
    ).resolves.toMatchObject({ id: mediaAsset.id });
    await expect(
      client.media.delete({ params: { id: mediaAsset.id } }),
    ).resolves.toEqual({ ok: true });

    expect(requests.map(({ method }) => method)).toEqual([
      "GET",
      "GET",
      "GET",
      "GET",
      "POST",
      "PATCH",
      "DELETE",
      "POST",
      "GET",
      "GET",
      "POST",
      "POST",
      "POST",
      "DELETE",
    ]);
    expect(requests[1]?.url).toContain("status=draft&page=2&pageSize=10");
    expect(requests[3]?.url).toContain(`/posts/${privatePost.id}/revisions`);
    await expect(requests[4]?.json()).resolves.toMatchObject({
      contentMarkdown: "",
      status: "draft",
      featured: false,
      categoryIds: [],
    });
    expect(requests[7]?.url).toContain(
      `/posts/${privatePost.id}/revisions/${revision.id}/restore`,
    );
    expect(requests[8]?.url).toContain("/api/v1/media");
    await expect(requests[10]?.json()).resolves.toMatchObject({
      blogId: blog.id,
      filename: "cover.webp",
      byteSize: 1_024,
    });
    expect(requests[11]?.url).toContain(`/media/${mediaAsset.id}/complete`);
    expect(requests[12]?.url).toContain(`/media/${mediaAsset.id}/backup`);
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
      return Promise.resolve(
        Response.json({
          blog,
          posts: [post],
          categories: [],
          pagination: { page: 2, pageSize: 12, hasMore: false },
        }),
      );
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
    await expect(client.getRendered("/a story")).resolves.toContain(
      "Published",
    );
  });

  it("rejects malformed public API responses", async () => {
    const client = createPublicClient({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
      fetch: vi.fn().mockResolvedValue(Response.json({ posts: [] })),
    });

    await expect(client.listPosts()).rejects.toThrow();
  });

  it("paginates all public posts without depending on a bound client method", async () => {
    const request = vi.fn((input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page"));
      return Promise.resolve(
        Response.json({
          blog,
          posts: [
            { ...post, id: `${page}2222222-2222-4222-8222-222222222222` },
          ],
          categories: [],
          pagination: { page, pageSize: 100, hasMore: page === 1 },
        }),
      );
    });
    const { listAllPosts } = createPublicClient({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
      fetch: request,
    });

    await expect(listAllPosts()).resolves.toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[1]?.[0])).toContain("page=2&pageSize=100");
  });

  it("distinguishes canonical posts, redirects, and missing posts", async () => {
    const request = vi.fn((input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.endsWith("/missing")) {
        return Promise.resolve(new Response("missing", { status: 404 }));
      }
      return Promise.resolve(Response.json({ blog, post }));
    });
    const client = createPublicClient({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
      fetch: request,
    });

    await expect(client.resolvePost("published")).resolves.toMatchObject({
      status: "found",
    });
    await expect(client.resolvePost("old-slug")).resolves.toMatchObject({
      status: "redirect",
      slug: "published",
    });
    await expect(client.resolvePost("missing")).resolves.toEqual({
      status: "not-found",
    });
  });

  it("loads the redirect manifest used by static framework builds", async () => {
    const redirects = [
      { fromPath: "old-slug", toPath: "published", statusCode: 301 },
    ];
    const client = createPublicClient({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
      fetch: vi.fn().mockResolvedValue(Response.json(redirects)),
    });

    await expect(client.listRedirects()).resolves.toEqual(redirects);
  });

  it("throws useful errors for failed public requests", async () => {
    const client = createPublicClient({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
      fetch: vi
        .fn()
        .mockResolvedValue(new Response("missing", { status: 404 })),
    });

    await expect(client.listPosts()).rejects.toMatchObject({
      name: "ProsewireRequestError",
      status: 404,
    } satisfies Partial<ProsewireRequestError>);
    await expect(client.getPost("missing")).rejects.toThrow(
      "Prosewire request failed (404)",
    );
    await expect(client.getRendered()).rejects.toThrow(
      "Prosewire request failed (404)",
    );
  });
});
