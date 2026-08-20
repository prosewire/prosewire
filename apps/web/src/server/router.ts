import {
  ApiAccessDenied,
  ApiAuthenticationFailed,
  ApiInputRejected,
  ApiPostNotFound,
  ApiUnavailable,
} from "@prosewire/contract";
import {
  archivePost,
  createPost,
  getPost,
  health,
  listBlogs,
  listPosts,
  type CreatePostBoundaryInput,
  type UpdatePostBoundaryInput,
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

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiInputRejected({ message: "Invalid JSON request body" });
  }
}

function positiveInteger(
  value: string | null,
  fallback: number,
  maximum?: number,
): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    throw new ApiInputRejected({ message: "Invalid pagination parameters" });
  }
  return parsed;
}

function postId(pathname: string): string | undefined {
  const match = /^\/api\/v1\/posts\/([^/]+)$/.exec(pathname);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new ApiInputRejected({ message: "Invalid post id" });
  }
}

async function dispatch(request: Request): Promise<unknown> {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  if (request.method === "GET" && pathname === "/api/v1/health") {
    return health(request);
  }
  if (request.method === "GET" && pathname === "/api/v1/blogs") {
    return listBlogs(request);
  }
  if (request.method === "GET" && pathname === "/api/v1/posts") {
    const status = searchParams.get("status");
    if (
      status !== null &&
      status !== "draft" &&
      status !== "scheduled" &&
      status !== "published" &&
      status !== "archived"
    ) {
      throw new ApiInputRejected({ message: "Invalid post status" });
    }
    return listPosts(request, {
      blog: searchParams.get("blog") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      status: status ?? undefined,
      page: positiveInteger(searchParams.get("page"), 1),
      pageSize: positiveInteger(searchParams.get("pageSize"), 20, 100),
    });
  }

  const id = postId(pathname);
  if (id && request.method === "GET") return getPost(request, id);
  if (pathname === "/api/v1/posts" && request.method === "POST") {
    return createPost(
      request,
      await jsonBody(request) as CreatePostBoundaryInput,
    );
  }
  if (id && request.method === "PATCH") {
    return updatePost(
      request,
      id,
      await jsonBody(request) as UpdatePostBoundaryInput,
    );
  }
  if (id && request.method === "DELETE") return archivePost(request, id);

  throw new ApiPostNotFound({ message: "API route not found" });
}

export async function handlePrivateApi(request: Request): Promise<Response> {
  try {
    return Response.json(await dispatch(request));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export * as PrivateApi from "./router";
