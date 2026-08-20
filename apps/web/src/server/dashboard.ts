import { Context, Effect, Layer, Schema } from "effect";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { ContentQueries } from "./content-queries.ts";
import type { DatabaseError } from "./database.ts";
import { BlogId, type PostId, type UserId } from "./domain.ts";

export class NoBlogConfigured extends Schema.TaggedError<NoBlogConfigured>()(
  "NoBlogConfigured",
  {},
) {
  override get message(): string {
    return "No blog is configured";
  }
}

export type Error = DatabaseError | BlogAccess.Error | NoBlogConfigured;

export const create = Effect.fn("Dashboard.create")(function* () {
  const content = yield* ContentQueries.Service;
  const access = yield* BlogAccess.Service;
  const config = yield* WebConfig;

  const authorizedBlog = Effect.fnUntraced(function* (actorId: UserId) {
    const blog = yield* content.getDefaultBlog();
    if (!blog) return yield* new NoBlogConfigured();
    yield* access.requireRead(BlogId.make(blog.id), actorId);
    return blog;
  });

  const shell = Effect.fn("Dashboard.shell")(function* (actorId: UserId) {
    return yield* authorizedBlog(actorId);
  });

  const analytics = Effect.fn("Dashboard.analytics")(function* (actorId: UserId) {
    const blog = yield* authorizedBlog(actorId);
    const blogId = BlogId.make(blog.id);
    const data = yield* Effect.all(
      {
        metrics: content.getDashboardMetrics(blogId),
        posts: content.getDashboardPosts(blogId),
        series: content.getViewSeries(blogId),
      },
      { concurrency: "unbounded" },
    );
    return { blog, ...data };
  });

  const contentLibrary = Effect.fn("Dashboard.contentLibrary")(function* (
    actorId: UserId,
  ) {
    const blog = yield* authorizedBlog(actorId);
    const library = yield* content.getContentLibrary(BlogId.make(blog.id));
    return { blog, ...library };
  });

  const overview = Effect.fn("Dashboard.overview")(function* (actorId: UserId) {
    const blog = yield* authorizedBlog(actorId);
    const blogId = BlogId.make(blog.id);
    const { metrics, posts, series } = yield* Effect.all(
      {
        metrics: content.getDashboardMetrics(blogId),
        posts: content.getDashboardPosts(blogId),
        series: content.getViewSeries(blogId),
      },
      { concurrency: "unbounded" },
    );
    return { blog, metrics, posts, series };
  });

  const integration = Effect.fn("Dashboard.integration")(function* (
    actorId: UserId,
  ) {
    const blog = yield* authorizedBlog(actorId);
    return { blog, origin: config.publicUrl };
  });

  const posts = Effect.fn("Dashboard.posts")(function* (
    actorId: UserId,
    search?: string,
  ) {
    const blog = yield* authorizedBlog(actorId);
    const rows = yield* content.getDashboardPosts(BlogId.make(blog.id), search);
    return { blog, posts: rows, q: search };
  });

  const settings = Effect.fn("Dashboard.settings")(function* (actorId: UserId) {
    return yield* authorizedBlog(actorId);
  });

  const team = Effect.fn("Dashboard.team")(function* (actorId: UserId) {
    const blog = yield* authorizedBlog(actorId);
    const result = yield* content.getTeam(BlogId.make(blog.id));
    return { blog, ...result };
  });

  const newPost = Effect.fn("Dashboard.newPost")(function* (actorId: UserId) {
    const blog = yield* authorizedBlog(actorId);
    const blogId = BlogId.make(blog.id);
    const { authors, categories } = yield* Effect.all(
      {
        authors: content.getAuthors(blogId),
        categories: content.getCategories(blogId),
      },
      { concurrency: "unbounded" },
    );
    return { blog, authors, categories };
  });

  const editPost = Effect.fn("Dashboard.editPost")(function* (
    actorId: UserId,
    postId: PostId,
  ) {
    const blog = yield* authorizedBlog(actorId);
    const post = yield* content.getDashboardPost(postId);
    if (!post || post.blogId !== blog.id) return null;
    const blogId = BlogId.make(blog.id);
    const { authors, categories } = yield* Effect.all(
      {
        authors: content.getAuthors(blogId),
        categories: content.getCategories(blogId),
      },
      { concurrency: "unbounded" },
    );
    return { post, authors, categories };
  });

  return {
    shell,
    analytics,
    contentLibrary,
    overview,
    integration,
    posts,
    settings,
    team,
    newPost,
    editPost,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/Dashboard",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as Dashboard from "./dashboard";
