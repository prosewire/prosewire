import {
  ApiAccessDenied,
  ApiAuthenticationFailed,
  ApiInputRejected,
  ApiPostNotFound,
  ApiUnavailable,
  api,
} from "@prosewire/contract";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  archivePost,
  createPost,
  getPost,
  health,
  listBlogs,
  listPosts,
  updatePost,
} from "./api-entrypoints.ts";
import { processSingleton } from "./process-singleton.ts";

type ApiError =
  | ApiInputRejected
  | ApiAuthenticationFailed
  | ApiAccessDenied
  | ApiPostNotFound
  | ApiUnavailable;

function requestSource(request: { readonly source: object }): Request {
  if (request.source instanceof Request) return request.source;
  throw new ApiUnavailable({ message: "Unsupported request transport" });
}

function fromPromise<A>(evaluate: () => Promise<A>): Effect.Effect<A, ApiError> {
  return Effect.tryPromise({
    try: evaluate,
    catch: (error) => {
      if (
        error instanceof ApiInputRejected ||
        error instanceof ApiAuthenticationFailed ||
        error instanceof ApiAccessDenied ||
        error instanceof ApiPostNotFound ||
        error instanceof ApiUnavailable
      ) {
        return error;
      }
      return new ApiUnavailable({ message: "Internal server error" });
    },
  });
}

function healthFromPromise<A>(
  evaluate: () => Promise<A>,
): Effect.Effect<A, ApiUnavailable> {
  return Effect.tryPromise({
    try: evaluate,
    catch: (error) =>
      error instanceof ApiUnavailable
        ? error
        : new ApiUnavailable({ message: "Internal server error" }),
  });
}

const HealthLive = HttpApiBuilder.group(api, "health", (handlers) =>
  handlers.handle("check", ({ request }) => {
    const source = requestSource(request);
    return healthFromPromise(() => health(source));
  }),
);

const BlogsLive = HttpApiBuilder.group(api, "blogs", (handlers) =>
  handlers.handle("list", ({ request }) => {
    const source = requestSource(request);
    return fromPromise(() => listBlogs(source));
  }),
);

const PostsLive = HttpApiBuilder.group(api, "posts", (handlers) =>
  handlers
    .handle("list", ({ query, request }) => {
      const source = requestSource(request);
      return fromPromise(() =>
        listPosts(source, {
          ...query,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
        }),
      );
    })
    .handle("get", ({ params, request }) => {
      const source = requestSource(request);
      return fromPromise(() => getPost(source, params.id));
    })
    .handle("create", ({ payload, request }) => {
      const source = requestSource(request);
      return fromPromise(() => createPost(source, payload));
    })
    .handle("update", ({ params, payload, request }) => {
      const source = requestSource(request);
      return fromPromise(() =>
        updatePost(source, params.id, payload),
      );
    })
    .handle("archive", ({ params, request }) => {
      const source = requestSource(request);
      return fromPromise(() => archivePost(source, params.id));
    }),
);

const ApiLive = HttpApiBuilder.layer(api).pipe(
  Layer.provide([HealthLive, BlogsLive, PostsLive]),
  Layer.provide(HttpServer.layerServices),
);

const webHandler = processSingleton(
  "@prosewire/web/PrivateHttpApi/v1",
  () => HttpRouter.toWebHandler(ApiLive),
);

export function handlePrivateApi(request: Request): Promise<Response> {
  return webHandler.handler(request);
}

export * as PrivateApi from "./router";
