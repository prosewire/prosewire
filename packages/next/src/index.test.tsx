import type {
  PublicBlog,
  PublicContentClient,
  PublicPost,
  PublicPostPage,
} from "@prosewire/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createProsewireApp } from "./app.tsx";
import { ProsewireIndex, ProsewirePost } from "./components.tsx";
import { createProsewirePages } from "./pages.tsx";
import { postPath } from "./shared.ts";

const blog: PublicBlog = {
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

const post: PublicPost = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "published",
  title: "Published",
  excerpt: "An excerpt",
  contentMarkdown: "# Published",
  contentHtml: "<h2>Safe content</h2>",
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
    bio: "Writes field notes.",
    avatarUrl: null,
    jobTitle: null,
    credentials: null,
  },
  categories: [],
};

const page: PublicPostPage = {
  blog,
  posts: [post],
  categories: [],
  pagination: { page: 1, pageSize: 12, hasMore: false },
};

function client(
  overrides: Partial<PublicContentClient> = {},
): PublicContentClient {
  return {
    listPosts: vi.fn().mockResolvedValue(page),
    listAllPosts: vi.fn().mockResolvedValue([post]),
    getPost: vi.fn().mockResolvedValue({ blog, post }),
    resolvePost: vi.fn().mockResolvedValue({ status: "found", blog, post }),
    listRedirects: vi
      .fn()
      .mockResolvedValue([
        { fromPath: "old-slug", toPath: "published", statusCode: 301 },
      ]),
    getRendered: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

describe("@prosewire/next", () => {
  it("joins post paths at nested and root mounts", () => {
    expect(postPath("/writing", "a/b")).toBe("/writing/a%2Fb");
    expect(postPath("/", "published")).toBe("/published");
  });

  it("renders semantic hooks without imposing inline styles", () => {
    const index = renderToStaticMarkup(
      <ProsewireIndex result={page} basePath="/writing" />,
    );
    const article = renderToStaticMarkup(
      <ProsewirePost blog={blog} post={post} basePath="/writing" />,
    );

    expect(index).toContain('data-prosewire="index"');
    expect(index).toContain('class="pw-post-card"');
    expect(index).toContain('href="/writing/published"');
    expect(article).toContain('data-prosewire-part="post-body"');
    expect(article).toContain("<h2>Safe content</h2>");
    expect(`${index}${article}`).not.toContain("style=");
  });

  it("prebuilds canonical and legacy paths for the Pages Router", async () => {
    const integration = createProsewirePages({
      baseUrl: "https://content.example",
      publication: "field-notes",
      basePath: "/writing",
      client: client(),
    });

    await expect(integration.post.getStaticPaths()).resolves.toEqual({
      paths: [
        { params: { slug: "published" } },
        { params: { slug: "old-slug" } },
      ],
      fallback: "blocking",
    });
  });

  it("lets App Router adopters replace the markup without changing route behavior", async () => {
    const customIndex = vi.fn(({ result }: { result: PublicPostPage }) => (
      <section data-custom-index>{result.blog.name}</section>
    ));
    const customPost = vi.fn(({ post: value }: { post: PublicPost }) => (
      <article data-custom-post>{value.title}</article>
    ));
    const integration = createProsewireApp({
      baseUrl: "https://content.example",
      publication: "field-notes",
      basePath: "/writing",
      client: client(),
      components: { IndexPage: customIndex, PostPage: customPost },
    });

    const indexElement = await integration.index.Page({
      searchParams: Promise.resolve({ page: "2", category: "engineering" }),
    });
    const postElement = await integration.post.Page({
      params: Promise.resolve({ slug: "published" }),
    });

    expect(renderToStaticMarkup(indexElement)).toContain("data-custom-index");
    expect(renderToStaticMarkup(postElement)).toContain("data-custom-post");
    expect(customIndex).toHaveBeenCalledOnce();
    expect(customPost).toHaveBeenCalledOnce();
    await expect(
      integration.post.generateMetadata({
        params: { slug: "published" },
      }),
    ).resolves.toMatchObject({ title: "Published" });
  });

  it("turns resolved legacy slugs into permanent framework redirects", async () => {
    const integration = createProsewirePages({
      baseUrl: "https://content.example",
      publication: "field-notes",
      basePath: "/writing",
      client: client({
        resolvePost: vi.fn().mockResolvedValue({
          status: "redirect",
          slug: "published",
          blog,
          post,
        }),
      }),
    });

    await expect(
      integration.post.getStaticProps({
        params: { slug: "old-slug" },
      } as never),
    ).resolves.toMatchObject({
      redirect: { destination: "/writing/published", permanent: true },
    });
  });
});
