import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache, createElement } from "react";
import { ProsewireIndex, ProsewirePost } from "./components.tsx";
import {
  canonicalPostUrl,
  createNextClient,
  normalizeBasePath,
  type ProsewireNextOptions,
  pageNumber,
  postPath,
} from "./shared.ts";

type Awaitable<T> = T | Promise<T>;

type SearchParams = Awaitable<{
  readonly q?: string | ReadonlyArray<string>;
  readonly category?: string | ReadonlyArray<string>;
  readonly page?: string | ReadonlyArray<string>;
}>;

export function createProsewireApp(options: ProsewireNextOptions) {
  const client = createNextClient(options);
  const basePath = normalizeBasePath(options.basePath);
  const IndexPage = options.components?.IndexPage ?? ProsewireIndex;
  const PostPage = options.components?.PostPage ?? ProsewirePost;
  const getIndex = cache((page: number, search?: string, category?: string) =>
    client.listPosts({
      page,
      pageSize: 12,
      ...(search ? { search } : {}),
      ...(category ? { category } : {}),
    }),
  );
  const getPost = cache((slug: string) => client.resolvePost(slug));

  async function IndexRoute({
    searchParams,
  }: {
    readonly searchParams?: SearchParams;
  }) {
    const query = await searchParams;
    const search = Array.isArray(query?.q) ? query.q[0] : query?.q;
    const category = Array.isArray(query?.category)
      ? query.category[0]
      : query?.category;
    const result = await getIndex(pageNumber(query?.page), search, category);
    return createElement(IndexPage, { result, basePath, search, category });
  }

  async function generateIndexMetadata(): Promise<Metadata> {
    const result = await getIndex(1);
    return { title: result.blog.name, description: result.blog.description };
  }

  type PostRouteProps = {
    readonly params: Awaitable<{ readonly slug: string }>;
  };

  async function PostRoute({ params }: PostRouteProps) {
    const { slug } = await params;
    const result = await getPost(slug);
    if (result.status === "not-found") notFound();
    if (result.status === "redirect") {
      permanentRedirect(postPath(basePath, result.slug));
    }
    return createElement(PostPage, {
      blog: result.blog,
      post: result.post,
      basePath,
      canonicalUrl: canonicalPostUrl(options, result.blog, result.post),
    });
  }

  async function generatePostMetadata({
    params,
  }: PostRouteProps): Promise<Metadata> {
    const { slug } = await params;
    const result = await getPost(slug);
    if (result.status === "not-found") return {};
    const canonical = canonicalPostUrl(options, result.blog, result.post);
    return {
      title: result.post.seoTitle ?? result.post.title,
      description: result.post.seoDescription ?? result.post.excerpt,
      alternates: canonical ? { canonical } : undefined,
      authors: [{ name: result.post.author.name }],
    };
  }

  return {
    client,
    index: { Page: IndexRoute, generateMetadata: generateIndexMetadata },
    post: { Page: PostRoute, generateMetadata: generatePostMetadata },
  };
}

export type { ProsewireNextOptions } from "./shared.ts";
