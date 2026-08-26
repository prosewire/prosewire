import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { transform } from "@astrojs/compiler";
import { describe, expect, it, vi } from "vitest";
import prosewire, { createProsewire, normalizeBasePath } from "./index.ts";

describe("@prosewire/astro", () => {
  it("compiles every shipped Astro component and route", async () => {
    const root = new URL("..", import.meta.url);
    const files = [
      "components/PostList.astro",
      "components/PostArticle.astro",
      "components/PostMetadata.astro",
      "routes/static-index.astro",
      "routes/static-post.astro",
      "routes/server-index.astro",
      "routes/server-post.astro",
    ];

    await Promise.all(
      files.map(async (file) => {
        const filename = join(root.pathname, file);
        const source = await readFile(filename, "utf8");
        await expect(transform(source, { filename })).resolves.toHaveProperty(
          "code",
        );
      }),
    );

    const components = await Promise.all(
      files
        .slice(0, 2)
        .map((file) => readFile(join(root.pathname, file), "utf8")),
    );
    expect(components.join("\n")).toContain('data-prosewire-part="post-body"');
    expect(components.join("\n")).not.toMatch(/<style|style=/);

    const metadata = await readFile(
      join(root.pathname, "components/PostMetadata.astro"),
      "utf8",
    );
    expect(metadata).toContain('property="og:type"');
    expect(metadata).toContain('name="twitter:card"');
    expect(metadata).toContain('property="article:published_time"');
  });

  it("normalizes the reader route and exposes a standalone client", () => {
    expect(normalizeBasePath("blog/")).toBe("/blog");
    expect(normalizeBasePath("/")).toBe("/");
    expect(
      createProsewire({
        baseUrl: "https://content.example",
        publication: "field-notes",
      }),
    ).toHaveProperty("resolvePost");
  });

  it.each([
    ["static", "static-index.astro", true],
    ["server", "server-index.astro", false],
  ] as const)(
    "injects %s routes with the matching rendering mode",
    async (output, entry, prerender) => {
      const injectRoute = vi.fn();
      const updateConfig = vi.fn();
      const integration = prosewire({
        baseUrl: "https://content.example",
        publication: "field-notes",
        basePath: "/writing/",
      });
      const setup = integration.hooks["astro:config:setup"];
      if (typeof setup !== "function") throw new Error("Expected a setup hook");

      await setup({
        config: { output },
        injectRoute,
        updateConfig,
      } as never);

      expect(injectRoute).toHaveBeenCalledTimes(2);
      expect(injectRoute.mock.calls[0]?.[0]).toMatchObject({
        pattern: "/writing",
        prerender,
      });
      expect(String(injectRoute.mock.calls[0]?.[0]?.entrypoint)).toContain(
        entry,
      );
      expect(updateConfig).toHaveBeenCalledOnce();

      const plugin = updateConfig.mock.calls[0]?.[0]?.vite?.plugins?.[0];
      expect(plugin?.resolveId?.("virtual:prosewire/config")).toBe(
        "\0virtual:prosewire/config",
      );
      expect(plugin?.resolveId?.("another-module")).toBeUndefined();
      expect(plugin?.load?.("another-module")).toBeUndefined();
      expect(plugin?.load?.("\0virtual:prosewire/config")).toContain(
        'export const basePath = "/writing";',
      );
      expect(plugin?.load?.("\0virtual:prosewire/config")).toContain(
        "export const revalidate = 60;",
      );
    },
  );

  it("can leave routing entirely to the adopter", async () => {
    const injectRoute = vi.fn();
    const integration = prosewire({
      baseUrl: "https://content.example",
      publication: "field-notes",
      injectRoutes: false,
    });
    const setup = integration.hooks["astro:config:setup"];
    if (typeof setup !== "function") throw new Error("Expected a setup hook");

    await setup({
      config: { output: "static" },
      injectRoute,
      updateConfig: vi.fn(),
    } as never);

    expect(injectRoute).not.toHaveBeenCalled();
  });

  it("passes an adopter-provided fetch implementation to the public client", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          blog: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Field Notes",
            slug: "field-notes",
            description: "Portable publishing",
            locale: "en",
            accentColor: "#ef6848",
            publicUrl: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
          posts: [],
          categories: [],
          pagination: { page: 1, pageSize: 12, hasMore: false },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = createProsewire({
      baseUrl: "https://content.example",
      publication: "field-notes",
      fetch: request,
    });

    await client.listPosts();

    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0]?.[0])).toContain(
      "/api/public/field-notes/posts",
    );
  });
});
