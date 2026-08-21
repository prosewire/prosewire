import {
  blogOutput,
  paginatedPosts,
  postCreateInput,
  postOutput,
  postStatus,
  postUpdateInput,
} from "@prosewire/contract";
import type { Client } from "@prosewire/sdk";
import { Effect, Layer, Schema } from "effect";
import { McpServer, Tool, Toolkit } from "effect/unstable/ai";
import { version } from "./version.ts";

class ProsewireToolFailure extends Schema.TaggedError<ProsewireToolFailure>()(
  "ProsewireToolFailure",
  { message: Schema.String },
) {}

export const PublicationGet =
  Tool.make("publication_get", {
    description:
      "Return the publication scoped to this API key (safe, read-only).",
    success: Schema.Struct({ publications: Schema.Array(blogOutput) }),
    failure: ProsewireToolFailure,
  })
    .annotate(Tool.Title, "Get active publication")
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false);

export const PostsList =
  Tool.make("posts_list", {
    description:
      "List and search posts in the API key's publication (safe, read-only).",
    parameters: Schema.Struct({
      blog: Schema.optionalKey(Schema.String),
      search: Schema.optionalKey(Schema.String),
      status: Schema.optionalKey(postStatus),
      page: Schema.optionalKey(
        Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
      ),
      pageSize: Schema.optionalKey(
        Schema.Int.check(
          Schema.isGreaterThanOrEqualTo(1),
          Schema.isLessThanOrEqualTo(100),
        ),
      ),
    }),
    success: paginatedPosts,
    failure: ProsewireToolFailure,
  })
    .annotate(Tool.Title, "List posts")
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false);

const postId = Schema.String.check(Schema.isUUID());

export const PostsGet =
  Tool.make("posts_get", {
    description: "Retrieve a post by its UUID (safe, read-only).",
    parameters: Schema.Struct({ id: postId }),
    success: postOutput,
    failure: ProsewireToolFailure,
  })
    .annotate(Tool.Title, "Get post")
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false);

export const PostsCreate =
  Tool.make("posts_create", {
    description: "Create a post (mutating — confirm with the user first).",
    parameters: postCreateInput,
    success: postOutput,
    failure: ProsewireToolFailure,
    needsApproval: true,
  })
    .annotate(Tool.Title, "Create post")
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, false)
    .annotate(Tool.OpenWorld, false);

export const PostsUpdate =
  Tool.make("posts_update", {
    description: "Update a post (mutating — confirm with the user first).",
    parameters: Schema.Struct({ id: postId, body: postUpdateInput }),
    success: postOutput,
    failure: ProsewireToolFailure,
    needsApproval: true,
  })
    .annotate(Tool.Title, "Update post")
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false);

export const PostsArchive =
  Tool.make("posts_archive", {
    description: "Archive a post (destructive — confirm with the user first).",
    parameters: Schema.Struct({ id: postId }),
    success: Schema.Struct({ ok: Schema.Literal(true) }),
    failure: ProsewireToolFailure,
    needsApproval: true,
  })
    .annotate(Tool.Title, "Archive post")
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, true)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false);

export const ProsewireToolkit = Toolkit.make(
  PublicationGet,
  PostsList,
  PostsGet,
  PostsCreate,
  PostsUpdate,
  PostsArchive,
);

const call = <A>(evaluate: () => Promise<A>) =>
  Effect.tryPromise({
    try: evaluate,
    catch: (error) =>
      new ProsewireToolFailure({
        message: error instanceof Error ? error.message : "Prosewire request failed",
      }),
  });

export interface ProsewireMcpClient {
  readonly blogs: Pick<Client["blogs"], "list">;
  readonly posts: Pick<
    Client["posts"],
    "list" | "get" | "create" | "update" | "archive"
  >;
}

export function createProsewireMcpHandlers(client: ProsewireMcpClient) {
  return ProsewireToolkit.toLayer({
    publication_get: () =>
      call(async () => ({ publications: await client.blogs.list() })),
    posts_list: (input) =>
      call(() =>
        client.posts.list({
          ...input,
          page: input.page ?? 1,
          pageSize: input.pageSize ?? 20,
        }),
      ),
    posts_get: ({ id }) => call(() => client.posts.get({ params: { id } })),
    posts_create: (input) => call(() => client.posts.create(input)),
    posts_update: ({ id, body }) =>
      call(() => client.posts.update({ params: { id }, body })),
    posts_archive: ({ id }) =>
      call(() => client.posts.archive({ params: { id } })),
  });
}

/**
 * Registers the Prosewire toolkit into whichever Effect MCP transport layer the
 * caller provides (stdio in the executable, or HTTP/in-memory in tests).
 */
export function createProsewireMcpServer(
  client: ProsewireMcpClient,
  _version = version,
) {
  return McpServer.toolkit(ProsewireToolkit).pipe(
    Layer.provideMerge(createProsewireMcpHandlers(client)),
  );
}

export const createProsewireMcpLayer = createProsewireMcpServer;

export * as ProsewireMcp from "./server";
