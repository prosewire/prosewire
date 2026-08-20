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

export class ApiInputRejected extends Schema.TaggedError<ApiInputRejected>()(
  "ApiInputRejected",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class ApiAuthenticationFailed extends Schema.TaggedError<ApiAuthenticationFailed>()(
  "ApiAuthenticationFailed",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class ApiAccessDenied extends Schema.TaggedError<ApiAccessDenied>()(
  "ApiAccessDenied",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class ApiPostNotFound extends Schema.TaggedError<ApiPostNotFound>()(
  "ApiPostNotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class ApiUnavailable extends Schema.TaggedError<ApiUnavailable>()(
  "ApiUnavailable",
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}

export const apiErrors = [
  ApiInputRejected,
  ApiAuthenticationFailed,
  ApiAccessDenied,
  ApiPostNotFound,
  ApiUnavailable,
] as const;

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

const health = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/health", {
    success: Schema.Struct({
      status: Schema.Literal("ok"),
      version: Schema.String,
    }),
    error: ApiUnavailable,
  }).annotate(OpenApi.Summary, "Database readiness probe"),
);

const blogs = HttpApiGroup.make("blogs").add(
  HttpApiEndpoint.get("list", "/blogs", {
    success: Schema.Array(blogOutput),
    error: apiErrors,
  }).annotate(OpenApi.Summary, "List blogs"),
);

const posts = HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("list", "/posts", {
      query: {
        blog: Schema.optionalKey(Schema.String),
        search: Schema.optionalKey(Schema.String),
        status: Schema.optionalKey(postStatus),
        page: Schema.optionalKey(pageNumber),
        pageSize: Schema.optionalKey(pageSize),
      },
      success: paginatedPosts,
      error: apiErrors,
    }).annotate(OpenApi.Summary, "List posts"),
  )
  .add(
    HttpApiEndpoint.get("get", "/posts/:id", {
      params: { id: uuid },
      success: postOutput,
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Get a post"),
  )
  .add(
    HttpApiEndpoint.post("create", "/posts", {
      payload: postCreateInput,
      success: postOutput.pipe(HttpApiSchema.status(200)),
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Create a post"),
  )
  .add(
    HttpApiEndpoint.patch("update", "/posts/:id", {
      params: { id: uuid },
      payload: postUpdateInput,
      success: postOutput,
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Update a post"),
  )
  .add(
    HttpApiEndpoint.delete("archive", "/posts/:id", {
      params: { id: uuid },
      success: Schema.Struct({ ok: Schema.Literal(true) }),
      error: apiErrors,
    }).annotate(OpenApi.Summary, "Archive a post"),
  );

export const api = HttpApi.make("ProsewireApi")
  .add(health, blogs, posts)
  .prefix("/api/v1")
  .annotate(OpenApi.Title, "Prosewire private API")
  .annotate(OpenApi.Version, "1.0.0");

/** @deprecated Use `api`. Kept as a source-compatible migration alias. */
export const contract = api;
export type Contract = typeof api;
