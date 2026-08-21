import { Schema } from "effect";
import {
  ApiInputRejected,
  ApiPostNotFound,
} from "./router.ts";
import {
  postCreateInput,
  postStatus,
  postUpdateInput,
  type PostCreateInput,
  type PostStatus,
  type PostUpdateInput,
} from "./schemas.ts";

const uuid = Schema.String.check(Schema.isUUID());
const pageNumber = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
);
const pageSize = Schema.NumberFromString.pipe(
  Schema.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
    Schema.isLessThanOrEqualTo(100),
  ),
);

export interface PostListRequest {
  readonly blog?: string | undefined;
  readonly search?: string | undefined;
  readonly status?: PostStatus | undefined;
  readonly page: number;
  readonly pageSize: number;
}

export type PrivateApiRequest =
  | { readonly _tag: "Health" }
  | { readonly _tag: "ListBlogs" }
  | { readonly _tag: "ListPosts"; readonly input: PostListRequest }
  | { readonly _tag: "GetPost"; readonly id: string }
  | { readonly _tag: "CreatePost"; readonly input: PostCreateInput }
  | {
      readonly _tag: "UpdatePost";
      readonly id: string;
      readonly input: PostUpdateInput;
    }
  | { readonly _tag: "ArchivePost"; readonly id: string };

async function decode<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  message: string,
): Promise<S["Type"]> {
  try {
    return await Schema.decodeUnknownPromise(schema)(value);
  } catch {
    throw new ApiInputRejected({ message });
  }
}

async function json(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiInputRejected({ message: "Invalid JSON request body" });
  }
}

async function identifier(pathname: string): Promise<string | undefined> {
  const match = /^\/api\/v1\/posts\/([^/]+)$/.exec(pathname);
  if (!match?.[1]) return undefined;
  let value: string;
  try {
    value = decodeURIComponent(match[1]);
  } catch {
    throw new ApiInputRejected({ message: "Invalid post id" });
  }
  return decode(uuid, value, "Invalid post id");
}

export async function decodePrivateApiRequest(
  request: Request,
): Promise<PrivateApiRequest> {
  const { pathname, searchParams } = new URL(request.url);
  if (request.method === "GET" && pathname === "/api/v1/health") {
    return { _tag: "Health" };
  }
  if (request.method === "GET" && pathname === "/api/v1/blogs") {
    return { _tag: "ListBlogs" };
  }
  if (request.method === "GET" && pathname === "/api/v1/posts") {
    const statusValue = searchParams.get("status");
    return {
      _tag: "ListPosts",
      input: {
        ...(searchParams.has("blog")
          ? { blog: searchParams.get("blog") ?? undefined }
          : {}),
        ...(searchParams.has("search")
          ? { search: searchParams.get("search") ?? undefined }
          : {}),
        ...(statusValue === null
          ? {}
          : {
              status: await decode(
                postStatus,
                statusValue,
                "Invalid post status",
              ),
            }),
        page: searchParams.has("page")
          ? await decode(
              pageNumber,
              searchParams.get("page"),
              "Invalid pagination parameters",
            )
          : 1,
        pageSize: searchParams.has("pageSize")
          ? await decode(
              pageSize,
              searchParams.get("pageSize"),
              "Invalid pagination parameters",
            )
          : 20,
      },
    };
  }

  const id = await identifier(pathname);
  if (id && request.method === "GET") return { _tag: "GetPost", id };
  if (pathname === "/api/v1/posts" && request.method === "POST") {
    return {
      _tag: "CreatePost",
      input: await decode(
        postCreateInput,
        await json(request),
        "Invalid post input",
      ),
    };
  }
  if (id && request.method === "PATCH") {
    return {
      _tag: "UpdatePost",
      id,
      input: await decode(
        postUpdateInput,
        await json(request),
        "Invalid post update",
      ),
    };
  }
  if (id && request.method === "DELETE") return { _tag: "ArchivePost", id };
  throw new ApiPostNotFound({ message: "API route not found" });
}

export * as PrivateApiTransport from "./transport.ts";
