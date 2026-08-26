import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from "effect/unstable/httpapi";
import {
  blogOutput,
  paginatedPosts,
  postCreateInput,
  postOutput,
  postStatus,
  postUpdateInput,
} from "./schemas.ts";

export const apiErrorStatusByTag = {
  ApiInputRejected: 400,
  ApiAuthenticationFailed: 401,
  ApiAccessDenied: 403,
  ApiPostNotFound: 404,
  ApiUnavailable: 500,
} as const;

export const privateApiPaths = {
  prefix: "/api/v1",
  health: "/health",
  blogs: "/blogs",
  posts: "/posts",
} as const;

export class ApiInputRejected extends Schema.TaggedError<ApiInputRejected>()(
  "ApiInputRejected",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiInputRejected },
) {}

export class ApiAuthenticationFailed extends Schema.TaggedError<ApiAuthenticationFailed>()(
  "ApiAuthenticationFailed",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiAuthenticationFailed },
) {}

export class ApiAccessDenied extends Schema.TaggedError<ApiAccessDenied>()(
  "ApiAccessDenied",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiAccessDenied },
) {}

export class ApiPostNotFound extends Schema.TaggedError<ApiPostNotFound>()(
  "ApiPostNotFound",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiPostNotFound },
) {}

export class ApiUnavailable extends Schema.TaggedError<ApiUnavailable>()(
  "ApiUnavailable",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiUnavailable },
) {}

export const apiErrors = [
  ApiInputRejected,
  ApiAuthenticationFailed,
  ApiAccessDenied,
  ApiPostNotFound,
  ApiUnavailable,
] as const;

export const privateApiPostId = Schema.String.check(Schema.isUUID());
export const privateApiPageNumber = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
);
export const privateApiPageSize = Schema.NumberFromString.pipe(
  Schema.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
    Schema.isLessThanOrEqualTo(100),
  ),
);
export const privateApiPostListQueryFields = {
  blog: Schema.optionalKey(Schema.String),
  search: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(postStatus),
  page: Schema.optionalKey(privateApiPageNumber),
  pageSize: Schema.optionalKey(privateApiPageSize),
} as const;
export const privateApiPostListQuery = Schema.Struct(
  privateApiPostListQueryFields,
);

const health = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", privateApiPaths.health, {
    success: Schema.Struct({
      status: Schema.Literal("ok"),
      version: Schema.String,
    }),
    error: ApiUnavailable,
  }).annotate(OpenApi.Summary, "Database readiness probe"),
);

const blogs = HttpApiGroup.make("blogs").add(
  HttpApiEndpoint.get("list", privateApiPaths.blogs, {
    success: Schema.Array(blogOutput),
    error: apiErrors,
  }).annotate(OpenApi.Summary, "List blogs"),
);

const posts = HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("list", privateApiPaths.posts, {
      query: privateApiPostListQueryFields,
      success: paginatedPosts,
      error: apiErrors,
    }).annotate(OpenApi.Summary, "List posts"),
  )
  .add(
    HttpApiEndpoint.get("get", `${privateApiPaths.posts}/:id`, {
      params: { id: privateApiPostId },
      success: postOutput,
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Get a post"),
  )
  .add(
    HttpApiEndpoint.post("create", privateApiPaths.posts, {
      payload: postCreateInput,
      success: postOutput.pipe(HttpApiSchema.status(200)),
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Create a post"),
  )
  .add(
    HttpApiEndpoint.patch("update", `${privateApiPaths.posts}/:id`, {
      params: { id: privateApiPostId },
      payload: postUpdateInput,
      success: postOutput,
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Update a post"),
  )
  .add(
    HttpApiEndpoint.delete("archive", `${privateApiPaths.posts}/:id`, {
      params: { id: privateApiPostId },
      success: Schema.Struct({ ok: Schema.Literal(true) }),
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Archive a post"),
  );

export const api = HttpApi.make("ProsewireApi")
  .add(health, blogs, posts)
  .prefix(privateApiPaths.prefix)
  .annotate(OpenApi.Title, "Prosewire private API")
  .annotate(OpenApi.Version, "1.0.0");

/** @deprecated Use `api`. Kept as a source-compatible migration alias. */
export const contract = api;
export type Contract = typeof api;
