import { Context, Effect, Layer } from "effect";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { ContentQueries } from "./content-queries.ts";
import type { BlogId, OrganizationId, PostId, UserId } from "./domain.ts";

export interface Selection {
  readonly organizationId?: OrganizationId;
  readonly blogId?: BlogId;
}

export type Error = ContentQueries.PersistenceError | BlogAccess.Error;

export const create = Effect.fn("Dashboard.create")(function* () {
  const content = yield* ContentQueries.Service;
  const access = yield* BlogAccess.Service;
  const config = yield* WebConfig;

  const authorizedContext = Effect.fnUntraced(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    return yield* access.dashboardContext(
      actorId,
      selection.organizationId,
      selection.blogId,
    );
  });

  const shell = Effect.fn("Dashboard.shell")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    return yield* authorizedContext(actorId, selection);
  });

  const analytics = Effect.fn("Dashboard.analytics")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    const blog = context.publication;
    yield* access.requireAnalytics(blog.id, actorId);
    const data = yield* Effect.all(
      {
        metrics: content.getDashboardMetrics(blog.id),
        posts: content.getDashboardPosts(blog.id),
        series: content.getViewSeries(blog.id),
      },
      { concurrency: "unbounded" },
    );
    return { context, blog, ...data };
  });

  const contentLibrary = Effect.fn("Dashboard.contentLibrary")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    const blog = context.publication;
    yield* access.requireRead(blog.id, actorId);
    const library = yield* content.getContentLibrary(blog.id);
    return { context, blog, ...library };
  });

  const overview = Effect.fn("Dashboard.overview")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    const blog = context.publication;
    const { metrics, posts, series } = yield* Effect.all(
      {
        metrics: content.getDashboardMetrics(blog.id),
        posts: content.getDashboardPosts(blog.id),
        series: content.getViewSeries(blog.id),
      },
      { concurrency: "unbounded" },
    );
    return { context, blog, metrics, posts, series };
  });

  const integration = Effect.fn("Dashboard.integration")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    const blog = context.publication;
    yield* access.requireIntegrationsRead(blog.id, actorId);
    const apiKeys = yield* content.getApiKeys(blog.id);
    return { context, blog, apiKeys, origin: config.publicUrl };
  });

  const posts = Effect.fn("Dashboard.posts")(function* (
    actorId: UserId,
    selection: Selection,
    search?: string,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    const blog = context.publication;
    const rows = yield* content.getDashboardPosts(blog.id, search);
    return { context, blog, posts: rows, q: search };
  });

  const settings = Effect.fn("Dashboard.settings")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    return { context, blog: context.publication };
  });

  const team = Effect.fn("Dashboard.team")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    const blog = context.publication;
    const result = yield* content.getTeam(context.workspace.id, blog.id);
    const invitations = yield* access
      .requireMembersManage(context.workspace.id, actorId)
      .pipe(
        Effect.flatMap(() =>
          content.getPendingInvitations(context.workspace.id),
        ),
        Effect.catchTag("WorkspaceAccessDenied", () => Effect.succeed([])),
      );
    return { context, blog, ...result, invitations };
  });

  const audit = Effect.fn("Dashboard.audit")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    yield* access.requireAuditRead(context.workspace.id, actorId);
    const entries = yield* content.getAuditLog(context.workspace.id);
    return { context, entries };
  });

  const newPost = Effect.fn("Dashboard.newPost")(function* (
    actorId: UserId,
    selection: Selection,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    const blog = context.publication;
    yield* access.requirePostCreate(blog.id, actorId);
    const { authors, categories } = yield* Effect.all(
      {
        authors: content.getAuthors(blog.id),
        categories: content.getCategories(blog.id),
      },
      { concurrency: "unbounded" },
    );
    return { context, blog, authors, categories };
  });

  const editPost = Effect.fn("Dashboard.editPost")(function* (
    actorId: UserId,
    selection: Selection,
    postId: PostId,
  ) {
    const context = yield* authorizedContext(actorId, selection);
    const blog = context.publication;
    const post = yield* content.getDashboardPost(postId);
    if (!post || post.blogId !== blog.id) return null;
    yield* access.requirePostUpdate(blog.id, actorId, post.createdById);
    if (post.status === "scheduled" || post.status === "published") {
      yield* access.requirePublish(blog.id, actorId);
    }
    if (post.status === "archived") {
      yield* access.requireArchive(blog.id, actorId, post.createdById);
    }
    const { authors, categories } = yield* Effect.all(
      {
        authors: content.getAuthors(blog.id),
        categories: content.getCategories(blog.id),
      },
      { concurrency: "unbounded" },
    );
    return { context, blog, post, authors, categories };
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
    audit,
    newPost,
    editPost,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/Dashboard",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export * as Dashboard from "./dashboard";
