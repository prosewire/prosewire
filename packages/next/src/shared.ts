import {
  createPublicClient,
  type PublicBlog,
  type PublicContentClient,
  type PublicPost,
} from "@prosewire/sdk";

export interface ProsewireNextOptions {
  readonly baseUrl: string;
  readonly publication: string;
  readonly basePath?: string;
  readonly siteUrl?: string;
  readonly revalidate?: number;
  readonly fetch?: typeof fetch;
  readonly client?: PublicContentClient;
  readonly components?: Partial<ProsewireNextComponents>;
}

export interface IndexPageProps {
  readonly result: Awaited<ReturnType<PublicContentClient["listPosts"]>>;
  readonly basePath: string;
  readonly search?: string | undefined;
  readonly category?: string | undefined;
}

export interface PostPageProps {
  readonly blog: PublicBlog;
  readonly post: PublicPost;
  readonly basePath: string;
  readonly canonicalUrl?: string | undefined;
}

export interface ProsewireNextComponents {
  readonly IndexPage: React.ComponentType<IndexPageProps>;
  readonly PostPage: React.ComponentType<PostPageProps>;
}

export function normalizeBasePath(value = "/blog"): string {
  const normalized = `/${value}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized === "" ? "/" : normalized;
}

export function postPath(basePath: string, slug: string): string {
  return `${basePath === "/" ? "" : basePath}/${encodeURIComponent(slug)}`;
}

export function createNextClient(options: ProsewireNextOptions) {
  if (options.client) return options.client;
  const request = options.fetch ?? globalThis.fetch;
  const revalidate = options.revalidate ?? 60;
  const cachedFetch: typeof fetch = (input, init) =>
    request(input, {
      ...init,
      next: {
        revalidate,
        tags: [`prosewire:${options.publication}`],
      },
    } as RequestInit);
  return createPublicClient({
    baseUrl: options.baseUrl,
    blog: options.publication,
    fetch: cachedFetch,
  });
}

export function canonicalPostUrl(
  options: ProsewireNextOptions,
  blog: PublicBlog,
  post: PublicPost,
): string | undefined {
  if (post.canonicalUrl) return post.canonicalUrl;
  const basePath = normalizeBasePath(options.basePath);
  if (options.siteUrl) {
    return new URL(postPath(basePath, post.slug), options.siteUrl).toString();
  }
  if (blog.publicUrl) {
    return `${blog.publicUrl.replace(/\/$/, "")}/${encodeURIComponent(post.slug)}`;
  }
  return undefined;
}

export function pageNumber(
  value: string | ReadonlyArray<string> | undefined,
): number {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = Number(first ?? 1);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}
