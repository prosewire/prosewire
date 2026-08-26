import {
  ApiAccessDenied,
  ApiAuthenticationFailed,
  ApiInputRejected,
  ApiPostNotFound,
  ApiRevisionNotFound,
  ApiUnavailable,
  apiErrorStatusByTag,
  decodePrivateApiRequest,
} from "@prosewire/contract";
import {
  archivePost,
  createPost,
  getPost,
  health,
  listBlogs,
  listPostRevisions,
  listPosts,
  restorePostRevision,
  updatePost,
} from "./api-entrypoints.ts";

type ApiError =
  | ApiInputRejected
  | ApiAuthenticationFailed
  | ApiAccessDenied
  | ApiPostNotFound
  | ApiRevisionNotFound
  | ApiUnavailable;

function isApiError(error: unknown): error is ApiError {
  return (
    error instanceof ApiInputRejected ||
    error instanceof ApiAuthenticationFailed ||
    error instanceof ApiAccessDenied ||
    error instanceof ApiPostNotFound ||
    error instanceof ApiRevisionNotFound ||
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
