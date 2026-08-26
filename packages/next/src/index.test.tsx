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
import {
  canonicalPostUrl,
  createNextClient,
  normalizeBasePath,
  pageNumber,
  postPath,
} from "./shared.ts";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
  permanentRedirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

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
  coverImageUrl: "https://images.example/published.jpg",
  coverImageAlt: "A field notebook on a desk",
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
  categories: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Engineering",
      slug: "engineering",
      description: null,
    },
  ],
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
    expect(normalizeBasePath()).toBe("/blog");
    expect(normalizeBasePath("/")).toBe("/");
    expect(pageNumber(["3", "4"])).toBe(3);
    expect(pageNumber("2.8")).toBe(2);
    expect(pageNumber("invalid")).toBe(1);
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
    expect(article).toContain("https://images.example/published.jpg");
    expect(article).toContain('"inLanguage":"en"');
    expect(`${index}${article}`).not.toContain("style=");
  });

  it("renders filters, pagination, and optional post fields", () => {
    const filteredPage: PublicPostPage = {
      ...page,
      blog: { ...blog, description: "" },
      categories: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Engineering",
          slug: "engineering",
          description: null,
        },
      ],
      pagination: { page: 2, pageSize: 12, hasMore: true },
    };
    const sparsePost: PublicPost = {
      ...post,
      excerpt: "",
      publishedAt: null,
      author: { ...post.author, bio: null },
    };
    const index = renderToStaticMarkup(
      <ProsewireIndex
        result={filteredPage}
        basePath="/writing"
        search="native routes"
        category="engineering"
      />,
    );
    const article = renderToStaticMarkup(
      <ProsewirePost blog={blog} post={sparsePost} basePath="/writing" />,
    );

    expect(index).toContain("q=native+routes");
    expect(index).toContain("category=engineering");
    expect(index).toContain("page=3");
    expect(index).toContain('aria-current="page"');
    expect(article).not.toContain("pw-author-bio");
    expect(article).not.toContain("pw-post-date");
  });

  it("prebuilds canonical and legacy paths for the Pages Router", async () => {
    const integration = createProsewirePages({
      baseUrl: "https://content.example",
      publication: "field-notes",
      basePath: "/writing",
      siteUrl: "https://www.example.com",
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
      siteUrl: "https://www.example.com",
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
    ).resolves.toMatchObject({
      title: "Published",
      openGraph: {
        type: "article",
        url: "https://www.example.com/writing/published",
        images: [
          {
            url: "https://images.example/published.jpg",
            alt: "A field notebook on a desk",
          },
        ],
        tags: ["Engineering"],
      },
      twitter: {
        card: "summary_large_image",
        images: ["https://images.example/published.jpg"],
      },
    });
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

  it("returns complete static props and renders Pages Router routes", async () => {
    const integration = createProsewirePages({
      baseUrl: "https://content.example",
      publication: "field-notes",
      siteUrl: "https://www.example.com",
      revalidate: 120,
      client: client(),
    });

    await expect(
      integration.index.getStaticProps({} as never),
    ).resolves.toEqual({ props: { result: page }, revalidate: 120 });
    await expect(
      integration.post.getStaticProps({ params: {} } as never),
    ).resolves.toEqual({ notFound: true, revalidate: 120 });
    await expect(
      integration.post.getStaticProps({
        params: { slug: ["published"] },
      } as never),
    ).resolves.toEqual({ props: { blog, post }, revalidate: 120 });

    expect(
      renderToStaticMarkup(<integration.index.Page result={page} />),
    ).toContain("Field Notes");
    const postMarkup = renderToStaticMarkup(
      <integration.post.Page blog={blog} post={post} />,
    );
    expect(postMarkup).toContain("https://www.example.com/blog/published");
    expect(postMarkup).toContain(
      '"image":"https://images.example/published.jpg"',
    );
  });

  it("handles missing and redirected App Router posts", async () => {
    const missing = createProsewireApp({
      baseUrl: "https://content.example",
      publication: "field-notes",
      client: client({
        resolvePost: vi.fn().mockResolvedValue({ status: "not-found" }),
      }),
    });
    await expect(
      missing.post.Page({ params: { slug: "missing" } }),
    ).rejects.toThrow("not found");
    await expect(
      missing.post.generateMetadata({ params: { slug: "missing" } }),
    ).resolves.toEqual({});

    const redirected = createProsewireApp({
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
      redirected.post.Page({ params: { slug: "old-slug" } }),
    ).rejects.toThrow("redirect:/writing/published");
  });

  it("builds cached public requests and canonical URLs", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(page), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const remote = createNextClient({
      baseUrl: "https://content.example",
      publication: "field-notes",
      revalidate: 30,
      fetch: request,
    });

    await remote.listPosts();

    expect(request.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 30, tags: ["prosewire:field-notes"] },
    });
    expect(
      canonicalPostUrl(
        { baseUrl: "https://content.example", publication: "field-notes" },
        blog,
        { ...post, canonicalUrl: "https://canonical.example/published" },
      ),
    ).toBe("https://canonical.example/published");
    expect(
      canonicalPostUrl(
        {
          baseUrl: "https://content.example",
          publication: "field-notes",
          siteUrl: "https://www.example.com",
        },
        blog,
        post,
      ),
    ).toBe("https://www.example.com/blog/published");
    expect(
      canonicalPostUrl(
        { baseUrl: "https://content.example", publication: "field-notes" },
        { ...blog, publicUrl: "https://content.example/field-notes/" },
        post,
      ),
    ).toBe("https://content.example/field-notes/published");
    expect(
      canonicalPostUrl(
        { baseUrl: "https://content.example", publication: "field-notes" },
        blog,
        post,
      ),
    ).toBeUndefined();
  });
});
