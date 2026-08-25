import {
  ApiAccessDenied,
  ApiAuthenticationFailed,
  ApiInputRejected,
  ApiPostNotFound,
  ApiUnavailable,
  type PostCreateInput,
  type PostUpdateInput,
} from "@prosewire/contract";
import { Effect, Result, Schema } from "effect";
import { ApiAccess, type Scope } from "./api-access.ts";
import { ApiContent, type PostListInput } from "./api-content.ts";
import { type AppServices, runAppEffect } from "./app-runtime.ts";
import { BlogId, PostId } from "./domain.ts";
import { PostErrors } from "./post-errors.ts";
import {
  ApiCreatePostInput,
  ApiUpdatePostInput,
  Publishing,
} from "./publishing.ts";

function toApiError(error: unknown) {
  if (error instanceof ApiAccess.AuthenticationFailed) {
    return new ApiAuthenticationFailed({ message: error.message });
  }
  if (
    error instanceof ApiAccess.ScopeDenied ||
    error instanceof ApiAccess.BlogDenied ||
    error instanceof ApiAccess.BlogReferenceDenied
  ) {
    return new ApiAccessDenied({ message: error.message });
  }
  if (error instanceof PostErrors.PostNotFound) {
    return new ApiPostNotFound({ message: error.message });
  }
  if (error instanceof PostErrors.InvalidPost) {
    return new ApiInputRejected({ message: error.message });
  }
  if (
    error instanceof ApiAccess.PersistenceError ||
    error instanceof ApiContent.PersistenceError ||
    error instanceof Publishing.PersistenceError ||
    error instanceof PostErrors.PostRenderingFailed
  ) {
    return new ApiUnavailable({ message: error.message });
  }
  throw error;
}

async function runApi<A, E>(
  request: Request,
  effect: Effect.Effect<A, E, AppServices>,
): Promise<A> {
  const result = await runAppEffect(Effect.result(effect), request.signal);
  if (Result.isFailure(result)) throw toApiError(result.failure);
  return result.success;
}

function bearerToken(request: Request): string | undefined {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
}

const invalidInput = (message: string) =>
  new PostErrors.InvalidPost({ message });

const decodePostId = (value: unknown) =>
  Schema.decodeUnknownEffect(PostId)(value).pipe(
    Effect.mapError(() => invalidInput("Invalid post id")),
  );

const decodeBlogId = (value: unknown) =>
  Schema.decodeUnknownEffect(BlogId)(value).pipe(
    Effect.mapError(() => invalidInput("Invalid blog id")),
  );

const decodeCreateInput = (value: unknown) =>
  Schema.decodeUnknownEffect(ApiCreatePostInput)(value).pipe(
    Effect.mapError(() => invalidInput("Invalid post input")),
  );

const decodeUpdateInput = (value: unknown) =>
  Schema.decodeUnknownEffect(ApiUpdatePostInput)(value).pipe(
    Effect.mapError(() => invalidInput("Invalid post update")),
  );

const principal = Effect.fn("ApiEntrypoints.principal")(function* (
  request: Request,
  scope: Scope,
) {
  const access = yield* ApiAccess.Service;
  return yield* access.authenticate(bearerToken(request), scope);
});

export function health(request: Request) {
  return runApi(
    request,
    Effect.flatMap(ApiContent.Service, (content) => content.health()),
  );
}

export function listBlogs(request: Request) {
  return runApi(
    request,
    Effect.gen(function* () {
      const actor = yield* principal(request, "content:read");
      const content = yield* ApiContent.Service;
      return yield* content.listBlogs(actor.blogId);
    }),
  );
}

export function listPosts(
  request: Request,
  input: PostListInput & { readonly blog?: string | undefined },
) {
  return runApi(
    request,
    Effect.gen(function* () {
      const actor = yield* principal(request, "content:read");
      const content = yield* ApiContent.Service;
      if (input.blog !== undefined) {
        const publication = (yield* content.listBlogs(actor.blogId))[0];
        if (
          !publication ||
          (input.blog !== publication.id && input.blog !== publication.slug)
        ) {
          return yield* new ApiAccess.BlogReferenceDenied({
            keyId: actor.keyId,
            authorizedBlogId: actor.blogId,
            requestedBlog: input.blog,
          });
        }
      }
      return yield* content.listPosts(actor.blogId, input);
    }),
  );
}

export function getPost(request: Request, id: string) {
  return runApi(
    request,
    Effect.gen(function* () {
      const actor = yield* principal(request, "content:read");
      const content = yield* ApiContent.Service;
      const postId = yield* decodePostId(id);
      return yield* content.getPost(actor.blogId, postId);
    }),
  );
}

export type CreatePostBoundaryInput = PostCreateInput;

export function createPost(request: Request, input: CreatePostBoundaryInput) {
  return runApi(
    request,
    Effect.gen(function* () {
      const actor = yield* principal(request, "content:write");
      const access = yield* ApiAccess.Service;
      const blogId = yield* decodeBlogId(input.blogId);
      const command = yield* decodeCreateInput(input);
      yield* access.requireBlog(actor, blogId);
      const publishing = yield* Publishing.Service;
      return yield* publishing.createApiPost(command, actor);
    }),
  );
}

export type UpdatePostBoundaryInput = PostUpdateInput;

export function updatePost(
  request: Request,
  id: string,
  input: UpdatePostBoundaryInput,
) {
  return runApi(
    request,
    Effect.gen(function* () {
      const actor = yield* principal(request, "content:write");
      const publishing = yield* Publishing.Service;
      const postId = yield* decodePostId(id);
      const command = yield* decodeUpdateInput(input);
      return yield* publishing.updateApiPost(postId, command, actor);
    }),
  );
}

export function archivePost(request: Request, id: string) {
  return runApi(
    request,
    Effect.gen(function* () {
      const actor = yield* principal(request, "content:write");
      const publishing = yield* Publishing.Service;
      const postId = yield* decodePostId(id);
      return yield* publishing.archiveApiPost(postId, actor);
    }),
  );
}

export * as ApiEntrypoints from "./api-entrypoints";
