import {
  api,
  type PostCreateEncodedInput,
  type PostCreateInput,
  type PostUpdateInput,
} from "@prosewire/contract";
import { Effect } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

export interface ProsewireClientOptions {
  /** Base URL of a Prosewire deployment, e.g. https://blog.example.com. */
  baseUrl: string;
  /** Private API key. Public rendered/raw endpoints do not need one. */
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface PrivatePostListInput {
  readonly blog?: string;
  readonly search?: string;
  readonly status?:
    | "draft"
    | "scheduled"
    | "published"
    | "archived";
  readonly page?: number;
  readonly pageSize?: number;
}

function normalizedCreateInput(input: PostCreateEncodedInput): PostCreateInput {
  return {
    ...input,
    contentMarkdown: input.contentMarkdown ?? "",
    status: input.status ?? "draft",
    locale: input.locale ?? "en",
    featured: input.featured ?? false,
    categoryIds: input.categoryIds ?? [],
  };
}

export function createEffectClient(options: ProsewireClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const generated = Effect.runSync(
    HttpApiClient.make(api, {
      baseUrl,
      transformClient: options.apiKey
        ? HttpClient.mapRequest(
            HttpClientRequest.bearerToken(options.apiKey),
          )
        : undefined,
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
  const provideFetch = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(
        FetchHttpClient.Fetch,
        options.fetch ?? globalThis.fetch,
      ),
    );

  return {
    health: () => provideFetch(generated.health.check()),
    blogs: {
      list: () => provideFetch(generated.blogs.list()),
    },
    posts: {
      list: (input: PrivatePostListInput = {}) =>
        provideFetch(generated.posts.list({ query: input })),
      get: (input: { readonly params: { readonly id: string } }) =>
        provideFetch(generated.posts.get(input)),
      create: (input: PostCreateEncodedInput) =>
        provideFetch(
          generated.posts.create({ payload: normalizedCreateInput(input) }),
        ),
      update: (input: {
        readonly params: { readonly id: string };
        readonly body: PostUpdateInput;
      }) =>
        provideFetch(
          generated.posts.update({
            params: input.params,
            payload: input.body,
          }),
        ),
      archive: (input: { readonly params: { readonly id: string } }) =>
        provideFetch(generated.posts.archive(input)),
    },
  };
}

export type EffectClient = ReturnType<typeof createEffectClient>;

export function createClient(options: ProsewireClientOptions) {
  const client = createEffectClient(options);
  return {
    health: () => Effect.runPromise(client.health()),
    blogs: {
      list: () => Effect.runPromise(client.blogs.list()),
    },
    posts: {
      list: (input: PrivatePostListInput = {}) =>
        Effect.runPromise(client.posts.list(input)),
      get: (input: { readonly params: { readonly id: string } }) =>
        Effect.runPromise(client.posts.get(input)),
      create: (input: PostCreateEncodedInput) =>
        Effect.runPromise(client.posts.create(input)),
      update: (input: {
        readonly params: { readonly id: string };
        readonly body: PostUpdateInput;
      }) => Effect.runPromise(client.posts.update(input)),
      archive: (input: { readonly params: { readonly id: string } }) =>
        Effect.runPromise(client.posts.archive(input)),
    },
  };
}

export type Client = ReturnType<typeof createClient>;

export interface PublicBlog {
  id: string;
  name: string;
  slug: string;
  description: string;
  locale: string;
  accentColor: string;
  publicUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAuthor {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  credentials: string | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface PublicPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMarkdown: string;
  contentHtml: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  locale: string;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  readingMinutes: number;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  author: PublicAuthor;
  categories: PublicCategory[];
}

export interface PublicPostPage {
  blog: PublicBlog;
  posts: PublicPost[];
  categories: PublicCategory[];
  pagination: { page: number; pageSize: number; hasMore: boolean };
}

export interface PublicPostResult {
  blog: PublicBlog;
  post: PublicPost;
}

export interface PublicListInput {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  /** @deprecated Use pageSize. */
  limit?: number;
}

export interface PublicContentClient {
  listPosts(input?: PublicListInput): Promise<PublicPostPage>;
  getPost(slug: string): Promise<PublicPostResult>;
  getRendered(path?: string): Promise<string>;
}

export function createPublicClient(
  options: Pick<ProsewireClientOptions, "baseUrl" | "fetch"> & { blog: string },
): PublicContentClient {
  const request = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const blog = encodeURIComponent(options.blog);
  return {
    async listPosts(input = {}) {
      const query = new URLSearchParams();
      if (input.search) query.set("search", input.search);
      if (input.category) query.set("category", input.category);
      if (input.page) query.set("page", String(input.page));
      if (input.pageSize) query.set("pageSize", String(input.pageSize));
      if (input.limit) query.set("limit", String(input.limit));
      const suffix = query.size ? `?${query.toString()}` : "";
      const response = await request(`${base}/api/public/${blog}/posts${suffix}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.json() as Promise<PublicPostPage>;
    },
    async getPost(slug) {
      const response = await request(`${base}/api/public/${blog}/posts/${encodeURIComponent(slug)}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.json() as Promise<PublicPostResult>;
    },
    async getRendered(path = "") {
      const encodedPath = path.replace(/^\//, "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
      const response = await request(`${base}/api/rendered/${blog}/${encodedPath}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.text();
    },
  };
}
