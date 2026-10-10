import {
  api,
  type MediaAsset,
  type MediaList,
  type MediaStartUploadInput,
  type MediaUploadReservation,
  type MediaUsage,
  type MediaVariant,
  type PortableImportReport,
  type PostCreateEncodedInput,
  type PostCreateInput,
  type PostRevision,
  type PostStatus,
  type PostUpdateInput,
  type PublicAuthor,
  type PublicBlog,
  type PublicCategory,
  type PublicPost,
  type PublicPostPage,
  type PublicPostResult,
  type PublicRedirect,
  portableImportPath,
  portableImportReport,
  publicPostPage,
  publicPostResult,
  publicRedirectOutput,
} from "@prosewire/contract";
import { Effect, Schema } from "effect";
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
  /** Assert that the API key belongs to this publication slug or UUID. */
  readonly blog?: string;
  readonly search?: string;
  readonly status?: PostStatus;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface PortableImportInput {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: "application/json" | "application/zip";
  readonly mode?: "preview" | "apply";
  /** Restore published/scheduled/archive states. Otherwise all posts arrive as drafts. */
  readonly preserveStates?: boolean;
}

export class ProsewireImportError extends Schema.TaggedError<ProsewireImportError>()(
  "ProsewireImportError",
  { status: Schema.Int, item: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `${this.item}: ${this.reason}`;
  }
}

function normalizedCreateInput(input: PostCreateEncodedInput): PostCreateInput {
  return {
    ...input,
    contentMarkdown: input.contentMarkdown ?? "",
    status: input.status ?? "draft",
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
        ? HttpClient.mapRequest(HttpClientRequest.bearerToken(options.apiKey))
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
    imports: {
      run: (input: PortableImportInput) =>
        Effect.tryPromise({
          try: async (signal) => {
            const query = new URLSearchParams({
              mode: input.mode ?? "preview",
              preserveStates: String(input.preserveStates ?? false),
            });
            const response = await (options.fetch ?? globalThis.fetch)(
              `${baseUrl}${portableImportPath}?${query}`,
              {
                method: "POST",
                headers: {
                  "content-type": input.contentType,
                  ...(options.apiKey
                    ? { authorization: `Bearer ${options.apiKey}` }
                    : {}),
                },
                body: input.body,
                duplex: "half",
                signal,
              } as RequestInit & { duplex: "half" },
            );
            const body: unknown = await response.json();
            if (!response.ok) {
              const failure = Schema.decodeUnknownSync(
                Schema.Struct({
                  item: Schema.optionalKey(Schema.String),
                  message: Schema.String,
                }),
              )(body);
              throw new ProsewireImportError({
                status: response.status,
                item: failure.item ?? "request",
                reason: failure.message,
              });
            }
            return Schema.decodeUnknownPromise(portableImportReport)(body);
          },
          catch: (cause) =>
            cause instanceof ProsewireImportError
              ? cause
              : new ProsewireImportError({
                  status: 0,
                  item: "request",
                  reason:
                    cause instanceof Error
                      ? cause.message
                      : "Publication import failed",
                }),
        }),
    },
    blogs: {
      list: () => provideFetch(generated.blogs.list()),
    },
    posts: {
      list: (input: PrivatePostListInput = {}) =>
        provideFetch(generated.posts.list({ query: input })),
      get: (input: { readonly params: { readonly id: string } }) =>
        provideFetch(generated.posts.get(input)),
      revisions: (input: { readonly params: { readonly id: string } }) =>
        provideFetch(generated.posts.listRevisions(input)),
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
      restore: (input: {
        readonly params: {
          readonly id: string;
          readonly revisionId: string;
        };
      }) => provideFetch(generated.posts.restoreRevision(input)),
    },
    media: {
      list: () => provideFetch(generated.media.list()),
      get: (input: { readonly params: { readonly id: string } }) =>
        provideFetch(generated.media.get(input)),
      startUpload: (input: MediaStartUploadInput) =>
        provideFetch(generated.media.startUpload({ payload: input })),
      completeUpload: (input: { readonly params: { readonly id: string } }) =>
        provideFetch(generated.media.completeUpload(input)),
      delete: (input: { readonly params: { readonly id: string } }) =>
        provideFetch(generated.media.delete(input)),
    },
  };
}

export type EffectClient = ReturnType<typeof createEffectClient>;

export function createClient(options: ProsewireClientOptions) {
  const client = createEffectClient(options);
  return {
    health: () => Effect.runPromise(client.health()),
    imports: {
      run: (input: PortableImportInput) =>
        Effect.runPromise(client.imports.run(input)),
    },
    blogs: {
      list: () => Effect.runPromise(client.blogs.list()),
    },
    posts: {
      list: (input: PrivatePostListInput = {}) =>
        Effect.runPromise(client.posts.list(input)),
      get: (input: { readonly params: { readonly id: string } }) =>
        Effect.runPromise(client.posts.get(input)),
      revisions: (input: { readonly params: { readonly id: string } }) =>
        Effect.runPromise(client.posts.revisions(input)),
      create: (input: PostCreateEncodedInput) =>
        Effect.runPromise(client.posts.create(input)),
      update: (input: {
        readonly params: { readonly id: string };
        readonly body: PostUpdateInput;
      }) => Effect.runPromise(client.posts.update(input)),
      archive: (input: { readonly params: { readonly id: string } }) =>
        Effect.runPromise(client.posts.archive(input)),
      restore: (input: {
        readonly params: {
          readonly id: string;
          readonly revisionId: string;
        };
      }) => Effect.runPromise(client.posts.restore(input)),
    },
    media: {
      list: () => Effect.runPromise(client.media.list()),
      get: (input: { readonly params: { readonly id: string } }) =>
        Effect.runPromise(client.media.get(input)),
      startUpload: (input: MediaStartUploadInput) =>
        Effect.runPromise(client.media.startUpload(input)),
      completeUpload: (input: { readonly params: { readonly id: string } }) =>
        Effect.runPromise(client.media.completeUpload(input)),
      delete: (input: { readonly params: { readonly id: string } }) =>
        Effect.runPromise(client.media.delete(input)),
    },
  };
}

export type Client = ReturnType<typeof createClient>;

export type {
  MediaAsset,
  MediaList,
  MediaStartUploadInput,
  MediaUploadReservation,
  MediaUsage,
  MediaVariant,
  PortableImportReport,
  PostRevision,
  PublicAuthor,
  PublicBlog,
  PublicCategory,
  PublicPost,
  PublicPostPage,
  PublicPostResult,
  PublicRedirect,
};

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
  listAllPosts(
    input?: Omit<PublicListInput, "page" | "pageSize" | "limit">,
  ): Promise<ReadonlyArray<PublicPost>>;
  getPost(slug: string): Promise<PublicPostResult>;
  resolvePost(slug: string): Promise<PublicPostResolution>;
  listRedirects(): Promise<ReadonlyArray<PublicRedirect>>;
  getRendered(path?: string): Promise<string>;
}

export type PublicPostResolution =
  | ({ status: "found" } & PublicPostResult)
  | ({ status: "redirect"; slug: string } & PublicPostResult)
  | { status: "not-found" };

export class ProsewireRequestError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(response: Response) {
    super(`Prosewire request failed (${String(response.status)})`);
    this.name = "ProsewireRequestError";
    this.status = response.status;
    this.url = response.url;
  }
}

async function decodeResponse<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  response: Response,
): Promise<S["Type"]> {
  return Schema.decodeUnknownPromise(schema)(await response.json());
}

export function createPublicClient(
  options: Pick<ProsewireClientOptions, "baseUrl" | "fetch"> & { blog: string },
): PublicContentClient {
  const request = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const blog = encodeURIComponent(options.blog);
  const postUrl = (slug: string) =>
    `${base}/api/public/${blog}/posts/${encodeURIComponent(slug)}`;
  const listPosts = async (input: PublicListInput = {}) => {
    const query = new URLSearchParams();
    if (input.search) query.set("search", input.search);
    if (input.category) query.set("category", input.category);
    if (input.page) query.set("page", String(input.page));
    if (input.pageSize) query.set("pageSize", String(input.pageSize));
    if (input.limit) query.set("limit", String(input.limit));
    const suffix = query.size ? `?${query.toString()}` : "";
    const response = await request(`${base}/api/public/${blog}/posts${suffix}`);
    if (!response.ok) throw new ProsewireRequestError(response);
    return decodeResponse(publicPostPage, response);
  };
  const resolvePost = async (slug: string): Promise<PublicPostResolution> => {
    const response = await request(postUrl(slug));
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) throw new ProsewireRequestError(response);
    const result = await decodeResponse(publicPostResult, response);
    return result.post.slug === slug
      ? { status: "found", ...result }
      : { status: "redirect", slug: result.post.slug, ...result };
  };
  return {
    listPosts,
    async listAllPosts(input = {}) {
      const posts: PublicPost[] = [];
      let page = 1;
      while (true) {
        const result = await listPosts({ ...input, page, pageSize: 100 });
        posts.push(...result.posts);
        if (!result.pagination.hasMore) return posts;
        page += 1;
      }
    },
    async getPost(slug) {
      const result = await resolvePost(slug);
      if (result.status === "not-found") {
        throw new ProsewireRequestError(new Response(null, { status: 404 }));
      }
      return { blog: result.blog, post: result.post };
    },
    resolvePost,
    async listRedirects() {
      const response = await request(`${base}/api/public/${blog}/redirects`);
      if (!response.ok) throw new ProsewireRequestError(response);
      return Schema.decodeUnknownPromise(Schema.Array(publicRedirectOutput))(
        await response.json(),
      );
    },
    async getRendered(path = "") {
      const encodedPath = path
        .replace(/^\//, "")
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");
      const response = await request(
        `${base}/api/rendered/${blog}/${encodedPath}`,
      );
      if (!response.ok) throw new ProsewireRequestError(response);
      return response.text();
    },
  };
}
