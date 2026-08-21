import {
  ApiAccessDenied,
  ApiAuthenticationFailed,
  ApiInputRejected,
  ApiPostNotFound,
  ApiUnavailable,
  decodePrivateApiRequest,
} from "@prosewire/contract";
import {
  archivePost,
  createPost,
  getPost,
  health,
  listBlogs,
  listPosts,
  updatePost,
} from "./api-entrypoints.ts";

type ApiError =
  | ApiInputRejected
  | ApiAuthenticationFailed
  | ApiAccessDenied
  | ApiPostNotFound
  | ApiUnavailable;

const statusByTag: Readonly<Record<ApiError["_tag"], number>> = {
  ApiInputRejected: 400,
  ApiAuthenticationFailed: 401,
  ApiAccessDenied: 403,
  ApiPostNotFound: 404,
  ApiUnavailable: 500,
};

function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiInputRejected ||
    error instanceof ApiAuthenticationFailed ||
    error instanceof ApiAccessDenied ||
    error instanceof ApiPostNotFound ||
    error instanceof ApiUnavailable;
}

function apiErrorResponse(error: unknown): Response {
  const failure = isApiError(error)
    ? error
    : new ApiUnavailable({ message: "Internal server error" });
  return Response.json(failure, { status: statusByTag[failure._tag] });
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
    case "CreatePost":
      return createPost(request, operation.input);
    case "UpdatePost":
      return updatePost(request, operation.id, operation.input);
    case "ArchivePost":
      return archivePost(request, operation.id);
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
