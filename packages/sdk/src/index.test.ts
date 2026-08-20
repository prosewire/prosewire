import { describe, expect, it, vi } from "vitest";
import { createClient, createPublicClient } from "./index.ts";

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

  it("queries every public content endpoint and encodes user input", async () => {
    const request = vi.fn((input: Parameters<typeof fetch>[0]) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/rendered/")) {
        return Promise.resolve(new Response("<article>Published</article>"));
      }
      return Promise.resolve(Response.json({ url }));
    });
    const client = createPublicClient({
      baseUrl: "https://content.example/",
      blog: "field notes",
      fetch: request,
    });

    const listing = await client.listPosts({
      search: "portable content",
      category: "engineering",
      limit: 12,
    }) as { url: string };
    expect(listing.url).toContain(
      "/api/public/field%20notes/posts?search=portable+content&category=engineering&limit=12",
    );
    const post = await client.getPost("a/b") as { url: string };
    expect(post.url).toBe(
      "https://content.example/api/public/field%20notes/posts/a%2Fb",
    );
    await expect(client.getRendered("/a story")).resolves.toContain("Published");
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
