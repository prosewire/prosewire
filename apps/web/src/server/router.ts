import {
  ApiAccessDenied,
  ApiAuthenticationFailed,
  ApiInputRejected,
  ApiMediaConflict,
  ApiMediaNotFound,
  ApiMediaTooLarge,
  ApiMediaUnavailable,
  ApiPostNotFound,
  ApiRevisionNotFound,
  ApiUnavailable,
  apiErrorStatusByTag,
  decodePrivateApiRequest,
} from "@prosewire/contract";
import {
  archivePost,
  completeMediaUpload,
  createPost,
  deleteMedia,
  getMedia,
  getPost,
  health,
  listBlogs,
  listMedia,
  listPostRevisions,
  listPosts,
  restorePostRevision,
  startMediaUpload,
  updatePost,
} from "./api-entrypoints.ts";

type ApiError =
  | ApiInputRejected
  | ApiAuthenticationFailed
  | ApiAccessDenied
  | ApiPostNotFound
  | ApiRevisionNotFound
  | ApiMediaNotFound
  | ApiMediaConflict
  | ApiMediaTooLarge
  | ApiMediaUnavailable
  | ApiUnavailable;

function isApiError(error: unknown): error is ApiError {
  return (
    error instanceof ApiInputRejected ||
    error instanceof ApiAuthenticationFailed ||
    error instanceof ApiAccessDenied ||
    error instanceof ApiPostNotFound ||
    error instanceof ApiRevisionNotFound ||
    error instanceof ApiMediaNotFound ||
    error instanceof ApiMediaConflict ||
    error instanceof ApiMediaTooLarge ||
    error instanceof ApiMediaUnavailable ||
    error instanceof ApiUnavailable
  );
}

function apiErrorResponse(error: unknown): Response {
  const failure = isApiError(error)
    ? error
    : new ApiUnavailable({ message: "Internal server error" });
  return Response.json(failure, {
    status: apiErrorStatusByTag[failure._tag],
  });
}

async function dispatch(request: Request): Promise<unknown> {
  const operation = await decodePrivateApiRequest(request);
  switch (operation._tag) {
    case "Health":
      return health(request);
    case "ListBlogs":
      return listBlogs(request);
    case "ListPosts":
      return listPosts(request, operation.input);
    case "GetPost":
      return getPost(request, operation.id);
    case "ListPostRevisions":
      return listPostRevisions(request, operation.id);
    case "CreatePost":
      return createPost(request, operation.input);
    case "UpdatePost":
      return updatePost(request, operation.id, operation.input);
    case "ArchivePost":
      return archivePost(request, operation.id);
    case "RestorePostRevision":
      return restorePostRevision(request, operation.id, operation.revisionId);
    case "ListMedia":
      return listMedia(request);
    case "GetMedia":
      return getMedia(request, operation.id);
    case "StartMediaUpload":
      return startMediaUpload(request, operation.input);
    case "CompleteMediaUpload":
      return completeMediaUpload(request, operation.id);
    case "DeleteMedia":
      return deleteMedia(request, operation.id);
  }
}

export async function handlePrivateApi(request: Request): Promise<Response> {
  try {
    return Response.json(await dispatch(request));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export * as PrivateApi from "./router";
