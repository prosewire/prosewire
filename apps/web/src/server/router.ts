import {
  ApiUnavailable,
  apiErrorStatusByTag,
  apiErrors,
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

type ApiError = InstanceType<(typeof apiErrors)[number]>;

function isApiError(error: unknown): error is ApiError {
  return apiErrors.some((ErrorClass) => error instanceof ErrorClass);
}

function apiErrorResponse(error: unknown): Response {
  if (!isApiError(error)) console.error("Unhandled private API failure", error);
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
      return Response.json(await startMediaUpload(request, operation.input), {
        status: 201,
      });
    case "CompleteMediaUpload":
      return completeMediaUpload(request, operation.id);
    case "DeleteMedia":
      return deleteMedia(request, operation.id);
  }
}

export async function handlePrivateApi(request: Request): Promise<Response> {
  try {
    const result = await dispatch(request);
    return result instanceof Response ? result : Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
