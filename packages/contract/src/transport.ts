import { Schema } from "effect";
import {
  ApiInputRejected,
  ApiMediaNotFound,
  ApiPostNotFound,
  privateApiMediaId,
  privateApiPaths,
  privateApiPostId,
  privateApiPostListQuery,
  privateApiRevisionId,
} from "./router.ts";
import {
  type MediaStartUploadInput,
  mediaStartUploadInput,
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
const mediaPath = path(privateApiPaths.media);

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
    }
  | { readonly _tag: "ListMedia" }
  | { readonly _tag: "GetMedia"; readonly id: string }
  | {
      readonly _tag: "StartMediaUpload";
      readonly input: MediaStartUploadInput;
    }
  | { readonly _tag: "CompleteMediaUpload"; readonly id: string }
  | { readonly _tag: "BackupMedia"; readonly id: string }
  | { readonly _tag: "DeleteMedia"; readonly id: string };

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

async function mediaIdentifier(pathname: string): Promise<
  | {
      readonly id: string;
      readonly action: "get" | "complete" | "backup";
    }
  | undefined
> {
  const prefix = `${mediaPath}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const segments = pathname.slice(prefix.length).split("/");
  if (segments.length < 1 || segments.length > 2 || !segments[0]) {
    return undefined;
  }
  const action =
    segments.length === 1
      ? "get"
      : segments[1] === "complete"
        ? "complete"
        : segments[1] === "backup"
          ? "backup"
          : undefined;
  if (!action) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(segments[0]);
  } catch {
    throw new ApiInputRejected({ message: "Invalid media asset id" });
  }
  return {
    id: await decode(privateApiMediaId, id, "Invalid media asset id"),
    action,
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
  if (request.method === "GET" && pathname === mediaPath) {
    return { _tag: "ListMedia" };
  }
  if (request.method === "POST" && pathname === `${mediaPath}/uploads`) {
    return {
      _tag: "StartMediaUpload",
      input: await decode(
        mediaStartUploadInput,
        await json(request),
        "Invalid media upload",
      ),
    };
  }
  const media = await mediaIdentifier(pathname);
  if (media?.action === "get" && request.method === "GET") {
    return { _tag: "GetMedia", id: media.id };
  }
  if (media?.action === "complete" && request.method === "POST") {
    return { _tag: "CompleteMediaUpload", id: media.id };
  }
  if (media?.action === "backup" && request.method === "POST") {
    return { _tag: "BackupMedia", id: media.id };
  }
  if (media?.action === "get" && request.method === "DELETE") {
    return { _tag: "DeleteMedia", id: media.id };
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
  if (pathname.startsWith(mediaPath)) {
    throw new ApiMediaNotFound({ message: "Media API route not found" });
  }
  throw new ApiPostNotFound({ message: "API route not found" });
}

export * as PrivateApiTransport from "./transport.ts";
