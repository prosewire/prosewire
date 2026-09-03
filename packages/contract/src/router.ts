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
  mediaAssetOutput,
  mediaListOutput,
  mediaStartUploadInput,
  mediaUploadReservationOutput,
  paginatedPosts,
  postCreateInput,
  postOutput,
  postRevisionOutput,
  postStatus,
  postUpdateInput,
} from "./schemas.ts";

export const apiErrorStatusByTag = {
  ApiInputRejected: 400,
  ApiAuthenticationFailed: 401,
  ApiAccessDenied: 403,
  ApiPostNotFound: 404,
  ApiRevisionNotFound: 404,
  ApiMediaNotFound: 404,
  ApiMediaConflict: 409,
  ApiMediaTooLarge: 413,
  ApiMediaUnavailable: 503,
  ApiUnavailable: 500,
} as const;

export const privateApiPaths = {
  prefix: "/api/v1",
  health: "/health",
  blogs: "/blogs",
  posts: "/posts",
  media: "/media",
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

export class ApiRevisionNotFound extends Schema.TaggedError<ApiRevisionNotFound>()(
  "ApiRevisionNotFound",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiRevisionNotFound },
) {}

export class ApiMediaNotFound extends Schema.TaggedError<ApiMediaNotFound>()(
  "ApiMediaNotFound",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiMediaNotFound },
) {}

export class ApiMediaConflict extends Schema.TaggedError<ApiMediaConflict>()(
  "ApiMediaConflict",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiMediaConflict },
) {}

export class ApiMediaTooLarge extends Schema.TaggedError<ApiMediaTooLarge>()(
  "ApiMediaTooLarge",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiMediaTooLarge },
) {}

export class ApiMediaUnavailable extends Schema.TaggedError<ApiMediaUnavailable>()(
  "ApiMediaUnavailable",
  { message: Schema.String },
  { httpApiStatus: apiErrorStatusByTag.ApiMediaUnavailable },
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
  ApiRevisionNotFound,
  ApiMediaNotFound,
  ApiMediaConflict,
  ApiMediaTooLarge,
  ApiMediaUnavailable,
  ApiUnavailable,
] as const;

export const privateApiPostId = Schema.String.check(Schema.isUUID());
export const privateApiRevisionId = Schema.String.check(Schema.isUUID());
export const privateApiMediaId = Schema.String.check(Schema.isUUID());
export const privateApiPageNumber = Schema.FiniteFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
);
export const privateApiPageSize = Schema.FiniteFromString.pipe(
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
  )
  .add(
    HttpApiEndpoint.get(
      "listRevisions",
      `${privateApiPaths.posts}/:id/revisions`,
      {
        params: { id: privateApiPostId },
        success: Schema.Array(postRevisionOutput),
        error: apiErrors,
      },
    ).annotate(OpenApi.Summary, "List post revisions"),
  )
  .add(
    HttpApiEndpoint.post(
      "restoreRevision",
      `${privateApiPaths.posts}/:id/revisions/:revisionId/restore`,
      {
        params: {
          id: privateApiPostId,
          revisionId: privateApiRevisionId,
        },
        success: postOutput,
        error: apiErrors,
      },
    ).annotate(OpenApi.Summary, "Restore a post revision"),
  );

const media = HttpApiGroup.make("media")
  .add(
    HttpApiEndpoint.get("list", privateApiPaths.media, {
      success: mediaListOutput,
      error: apiErrors,
    }).annotate(OpenApi.Summary, "List media assets and storage usage"),
  )
  .add(
    HttpApiEndpoint.get("get", `${privateApiPaths.media}/:id`, {
      params: { id: privateApiMediaId },
      success: mediaAssetOutput,
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Get a media asset"),
  )
  .add(
    HttpApiEndpoint.post("startUpload", `${privateApiPaths.media}/uploads`, {
      payload: mediaStartUploadInput,
      success: mediaUploadReservationOutput.pipe(HttpApiSchema.status(201)),
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Reserve storage and sign a direct upload"),
  )
  .add(
    HttpApiEndpoint.post(
      "completeUpload",
      `${privateApiPaths.media}/:id/complete`,
      {
        params: { id: privateApiMediaId },
        success: mediaAssetOutput,
        error: apiErrors,
      },
    ).annotate(OpenApi.Summary, "Validate and process an uploaded image"),
  )
  .add(
    HttpApiEndpoint.delete("delete", `${privateApiPaths.media}/:id`, {
      params: { id: privateApiMediaId },
      success: Schema.Struct({ ok: Schema.Literal(true) }),
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Delete an unreferenced media asset"),
  );

export const api = HttpApi.make("ProsewireApi")
  .add(health, blogs, posts, media)
  .prefix(privateApiPaths.prefix)
  .annotate(OpenApi.Title, "Prosewire private API")
  .annotate(OpenApi.Version, "1.0.0");

/** @deprecated Use `api`. Kept as a source-compatible migration alias. */
export const contract = api;
export type Contract = typeof api;
