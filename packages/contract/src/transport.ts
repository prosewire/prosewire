import { Schema } from "effect";
import {
  ApiInputRejected,
  ApiPostNotFound,
  privateApiPaths,
  privateApiPostId,
  privateApiPostListQuery,
} from "./router.ts";
import {
  type PostCreateInput,
  type PostStatus,
  type PostUpdateInput,
  postCreateInput,
  postUpdateInput,
} from "./schemas.ts";

const path = (route: string) => `${privateApiPaths.prefix}${route}`;
const healthPath = path(privateApiPaths.health);
const blogsPath = path(privateApiPaths.blogs);
const postsPath = path(privateApiPaths.posts);

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
  const prefix = `${postsPath}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const encoded = pathname.slice(prefix.length);
  if (!encoded || encoded.includes("/")) return undefined;
  let value: string;
  try {
    value = decodeURIComponent(encoded);
  } catch {
    throw new ApiInputRejected({ message: "Invalid post id" });
  }
  return decode(privateApiPostId, value, "Invalid post id");
}

export async function decodePrivateApiRequest(
  request: Request,
): Promise<PrivateApiRequest> {
  const { pathname, searchParams } = new URL(request.url);
  if (request.method === "GET" && pathname === healthPath) {
    return { _tag: "Health" };
  }
  if (request.method === "GET" && pathname === blogsPath) {
    return { _tag: "ListBlogs" };
  }
  if (request.method === "GET" && pathname === postsPath) {
    const query = await decode(
      privateApiPostListQuery,
      Object.fromEntries(searchParams),
      "Invalid post list query",
    );
    return {
      _tag: "ListPosts",
      input: {
        ...query,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      },
    };
  }

  const id = await identifier(pathname);
  if (id && request.method === "GET") return { _tag: "GetPost", id };
  if (pathname === postsPath && request.method === "POST") {
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
