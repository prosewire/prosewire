import { Schema } from "effect";
import {
  ApiInputRejected,
  ApiPostNotFound,
  privateApiPaths,
  privateApiPostId,
  privateApiPostListQuery,
  privateApiRevisionId,
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
  | { readonly _tag: "ListPostRevisions"; readonly id: string }
  | { readonly _tag: "CreatePost"; readonly input: PostCreateInput }
  | {
      readonly _tag: "UpdatePost";
      readonly id: string;
      readonly input: PostUpdateInput;
    }
  | { readonly _tag: "ArchivePost"; readonly id: string }
  | {
      readonly _tag: "RestorePostRevision";
      readonly id: string;
      readonly revisionId: string;
    };

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

async function revisionRoute(pathname: string): Promise<
  | { readonly _tag: "List"; readonly id: string }
  | {
      readonly _tag: "Restore";
      readonly id: string;
      readonly revisionId: string;
    }
  | undefined
> {
  const prefix = `${postsPath}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const segments = pathname.slice(prefix.length).split("/");
  const isList = segments.length === 2 && segments[1] === "revisions";
  const isRestore =
    segments.length === 4 &&
    segments[1] === "revisions" &&
    segments[3] === "restore";
  if (!isList && !isRestore) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(segments[0] ?? "");
  } catch {
    throw new ApiInputRejected({ message: "Invalid post id" });
  }
  const decodedId = await decode(privateApiPostId, id, "Invalid post id");
  if (isList) return { _tag: "List", id: decodedId };
  let revisionId: string;
  try {
    revisionId = decodeURIComponent(segments[2] ?? "");
  } catch {
    throw new ApiInputRejected({ message: "Invalid revision id" });
  }
  return {
    _tag: "Restore",
    id: decodedId,
    revisionId: await decode(
      privateApiRevisionId,
      revisionId,
      "Invalid revision id",
    ),
  };
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

  const revision = await revisionRoute(pathname);
  if (revision?._tag === "List" && request.method === "GET") {
    return { _tag: "ListPostRevisions", id: revision.id };
  }
  if (revision?._tag === "Restore" && request.method === "POST") {
    return {
      _tag: "RestorePostRevision",
      id: revision.id,
      revisionId: revision.revisionId,
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
