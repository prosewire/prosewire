import {
  blogOutput,
  mediaAssetOutput,
  mediaListOutput,
  mediaStartUploadInput,
  mediaUploadReservationOutput,
  paginatedPosts,
  postCreateInput,
  postOutput,
  postRevisionOutput,
  postStatus,
  postUpdateInput,
} from "@prosewire/contract";
import type { EffectClient } from "@prosewire/sdk";
import { Effect, Layer, Schema } from "effect";
import { McpServer, Tool, Toolkit } from "effect/unstable/ai";
import { version } from "./version.ts";

class ProsewireToolFailure extends Schema.TaggedError<ProsewireToolFailure>()(
  "ProsewireToolFailure",
  { message: Schema.String },
) {}

export const PublicationGet = Tool.make("publication_get", {
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

export const PostsList = Tool.make("posts_list", {
  description:
    "List and search posts in the API key's publication. The optional blog value must match that publication's slug or UUID (safe, read-only).",
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

export const PostsGet = Tool.make("posts_get", {
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

export const PostsCreate = Tool.make("posts_create", {
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

export const PostsUpdate = Tool.make("posts_update", {
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

export const PostsArchive = Tool.make("posts_archive", {
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

export const PostsRevisionsList = Tool.make("posts_revisions_list", {
  description: "List a post's saved revisions (safe, read-only).",
  parameters: Schema.Struct({ id: postId }),
  success: Schema.Array(postRevisionOutput),
  failure: ProsewireToolFailure,
})
  .annotate(Tool.Title, "List post revisions")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const PostsRevisionRestore = Tool.make("posts_revision_restore", {
  description:
    "Restore a saved post revision (destructive, confirm with the user first).",
  parameters: Schema.Struct({ id: postId, revisionId: postId }),
  success: postOutput,
  failure: ProsewireToolFailure,
  needsApproval: true,
})
  .annotate(Tool.Title, "Restore post revision")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

const mediaId = Schema.String.check(Schema.isUUID());

export const MediaList = Tool.make("media_list", {
  description:
    "List media assets, post references, backup state, and quota usage (safe, read-only).",
  success: mediaListOutput,
  failure: ProsewireToolFailure,
})
  .annotate(Tool.Title, "List media assets")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const MediaUploadStart = Tool.make("media_upload_start", {
  description:
    "Reserve quota and create a signed image upload target (mutating, confirm with the user first).",
  parameters: mediaStartUploadInput,
  success: mediaUploadReservationOutput,
  failure: ProsewireToolFailure,
  needsApproval: true,
})
  .annotate(Tool.Title, "Start media upload")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

export const MediaUploadComplete = Tool.make("media_upload_complete", {
  description:
    "Validate and process an object after its signed upload has finished (mutating).",
  parameters: Schema.Struct({ id: mediaId }),
  success: mediaAssetOutput,
  failure: ProsewireToolFailure,
  needsApproval: true,
})
  .annotate(Tool.Title, "Complete media upload")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const MediaBackup = Tool.make("media_backup", {
  description: "Copy a ready media asset to the configured backup bucket.",
  parameters: Schema.Struct({ id: mediaId }),
  success: mediaAssetOutput,
  failure: ProsewireToolFailure,
  needsApproval: true,
})
  .annotate(Tool.Title, "Back up media asset")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const MediaDelete = Tool.make("media_delete", {
  description:
    "Delete an unreferenced media asset from primary storage (destructive, confirm with the user first).",
  parameters: Schema.Struct({ id: mediaId }),
  success: Schema.Struct({ ok: Schema.Literal(true) }),
  failure: ProsewireToolFailure,
  needsApproval: true,
})
  .annotate(Tool.Title, "Delete media asset")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const ProsewireToolkit = Toolkit.make(
  PublicationGet,
  PostsList,
  PostsGet,
  PostsCreate,
  PostsUpdate,
  PostsRevisionsList,
  PostsRevisionRestore,
  PostsArchive,
  MediaList,
  MediaUploadStart,
  MediaUploadComplete,
  MediaBackup,
  MediaDelete,
);

const toolFailure = (error: unknown) =>
  new ProsewireToolFailure({
    message:
      error instanceof Error ? error.message : "Prosewire request failed",
  });

const call = <A, E>(
  request: Effect.Effect<A, E> | PromiseLike<A>,
): Effect.Effect<A, ProsewireToolFailure> =>
  Effect.isEffect(request)
    ? request.pipe(Effect.mapError(toolFailure))
    : Effect.tryPromise({ try: () => request, catch: toolFailure });

type McpOperation<F> = F extends (
  ...args: infer Args
) => Effect.Effect<infer A, infer _E, infer R>
  ? (...args: Args) => Effect.Effect<A, unknown, R> | Promise<A>
  : never;

export interface ProsewireMcpClient {
  readonly blogs: {
    readonly list: McpOperation<EffectClient["blogs"]["list"]>;
  };
  readonly posts: {
    readonly list: McpOperation<EffectClient["posts"]["list"]>;
    readonly get: McpOperation<EffectClient["posts"]["get"]>;
    readonly create: McpOperation<EffectClient["posts"]["create"]>;
    readonly update: McpOperation<EffectClient["posts"]["update"]>;
    readonly revisions: McpOperation<EffectClient["posts"]["revisions"]>;
    readonly restore: McpOperation<EffectClient["posts"]["restore"]>;
    readonly archive: McpOperation<EffectClient["posts"]["archive"]>;
  };
  readonly media: {
    readonly list: McpOperation<EffectClient["media"]["list"]>;
    readonly startUpload: McpOperation<EffectClient["media"]["startUpload"]>;
    readonly completeUpload: McpOperation<
      EffectClient["media"]["completeUpload"]
    >;
    readonly backup: McpOperation<EffectClient["media"]["backup"]>;
    readonly delete: McpOperation<EffectClient["media"]["delete"]>;
  };
}

export function createProsewireMcpHandlers(client: ProsewireMcpClient) {
  return ProsewireToolkit.toLayer({
    publication_get: () =>
      call(client.blogs.list()).pipe(
        Effect.map((publications) => ({ publications })),
      ),
    posts_list: (input) =>
      call(
        client.posts.list({
          ...input,
          page: input.page ?? 1,
          pageSize: input.pageSize ?? 20,
        }),
      ),
    posts_get: ({ id }) => call(client.posts.get({ params: { id } })),
    posts_create: (input) => call(client.posts.create(input)),
    posts_update: ({ id, body }) =>
      call(client.posts.update({ params: { id }, body })),
    posts_revisions_list: ({ id }) =>
      call(client.posts.revisions({ params: { id } })),
    posts_revision_restore: ({ id, revisionId }) =>
      call(client.posts.restore({ params: { id, revisionId } })),
    posts_archive: ({ id }) => call(client.posts.archive({ params: { id } })),
    media_list: () => call(client.media.list()),
    media_upload_start: (input) => call(client.media.startUpload(input)),
    media_upload_complete: ({ id }) =>
      call(client.media.completeUpload({ params: { id } })),
    media_backup: ({ id }) => call(client.media.backup({ params: { id } })),
    media_delete: ({ id }) => call(client.media.delete({ params: { id } })),
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
