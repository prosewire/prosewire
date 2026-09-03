import { isTeamRole } from "@prosewire/core";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import {
  ApiKeySummary,
  AuditEntry,
  decodeBlog,
  TeamMember,
  toAuthor,
  toCategory,
  toDashboardPost,
  toDashboardPostDetail,
  toPublicPost,
  toRedirect,
  toSnippet,
  WorkspaceInvitation,
} from "./content-models.ts";
import { Database } from "./database.ts";
import {
  ApiKeyId,
  AuditLogId,
  type AuthorId,
  BlogId,
  type BlogSlug,
  InvitationId,
  MemberId,
  OrganizationId,
  type PostId,
  UserId,
} from "./domain.ts";
import { operationError } from "./operation-error.ts";

export interface PublicPostOptions {
  readonly search?: string;
  readonly category?: string;
  readonly authorId?: AuthorId;
  readonly limit?: number | null;
  readonly offset?: number;
}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "ContentQueriesPersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

export const create = Effect.fn("ContentQueries.create")(function* () {
  const database = yield* Database;
  const persistenceError = operationError(
    (input) => new PersistenceError(input),
  );
  const execute = <A>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<A>,
  ) => database.execute(operation, evaluate).pipe(persistenceError(operation));

  const getAuthors = Effect.fn("ContentQueries.getAuthors")(function* (
    blogId: BlogId,
  ) {
    const rows = yield* execute("author.list", (client) =>
      client.query.author.findMany({
        where: eq(schema.author.blogId, blogId),
        orderBy: [asc(schema.author.name)],
      }),
    );
    return rows.map(toAuthor);
  });

  const getCategories = Effect.fn("ContentQueries.getCategories")(function* (
    blogId: BlogId,
  ) {
    const rows = yield* execute("category.list", (client) =>
      client.query.category.findMany({
        where: eq(schema.category.blogId, blogId),
        orderBy: [asc(schema.category.name)],
      }),
    );
    return rows.map(toCategory);
  });

  const getDashboardPosts = Effect.fn("ContentQueries.getDashboardPosts")(
    function* (blogId: BlogId, search?: string) {
      const { rows, viewCounts } = yield* Effect.all(
        {
          rows: execute("post.listDashboard", (client) =>
            client.query.post.findMany({
              where: search?.trim()
                ? and(
                    eq(schema.post.blogId, blogId),
                    or(
                      ilike(schema.post.title, `%${search.trim()}%`),
                      ilike(schema.post.excerpt, `%${search.trim()}%`),
                    ),
                  )
                : eq(schema.post.blogId, blogId),
              with: {
                author: true,
                categories: { with: { category: true } },
              },
              orderBy: [desc(schema.post.updatedAt)],
            }),
          ),
          viewCounts: execute("post.listDashboardViewCounts", (client) =>
            client
              .select({ postId: schema.postView.postId, value: count() })
              .from(schema.postView)
              .innerJoin(
                schema.post,
                eq(schema.postView.postId, schema.post.id),
              )
              .where(eq(schema.post.blogId, blogId))
              .groupBy(schema.postView.postId),
          ),
        },
        { concurrency: "unbounded" },
      );
      const counts = new Map(
        viewCounts.map((row) => [row.postId, Number(row.value)]),
      );
      return rows.map((row) => toDashboardPost(row, counts.get(row.id) ?? 0));
    },
  );

  const getDashboardPost = Effect.fn("ContentQueries.getDashboardPost")(
    function* (id: PostId) {
      const row = yield* execute("post.getDashboard", (client) =>
        client.query.post.findFirst({
          where: eq(schema.post.id, id),
          with: {
            author: true,
            categories: { with: { category: true } },
            revisions: { orderBy: [desc(schema.postRevision.version)] },
          },
        }),
      );
      return row ? toDashboardPostDetail(row) : undefined;
    },
  );

  const getDashboardMetrics = Effect.fn("ContentQueries.getDashboardMetrics")(
    function* (blogId: BlogId) {
      const { postCounts, authorCount, viewCount } = yield* Effect.all(
        {
          postCounts: execute("metrics.postCounts", (client) =>
            client
              .select({ status: schema.post.status, value: count() })
              .from(schema.post)
              .where(eq(schema.post.blogId, blogId))
              .groupBy(schema.post.status),
          ),
          authorCount: execute("metrics.authorCount", (client) =>
            client.$count(schema.author, eq(schema.author.blogId, blogId)),
          ),
          viewCount: execute("metrics.viewCount", (client) =>
            client
              .select({ value: count() })
              .from(schema.postView)
              .innerJoin(
                schema.post,
                eq(schema.postView.postId, schema.post.id),
              )
              .where(eq(schema.post.blogId, blogId)),
          ),
        },
        { concurrency: "unbounded" },
      );
      const byStatus = Object.fromEntries(
        postCounts.map((row) => [row.status, Number(row.value)]),
      );
      return {
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        published: byStatus["published"] ?? 0,
        drafts: byStatus["draft"] ?? 0,
        scheduled: byStatus["scheduled"] ?? 0,
        authors: authorCount,
        views: Number(viewCount[0]?.value ?? 0),
      };
    },
  );

  const getViewSeries = Effect.fn("ContentQueries.getViewSeries")(function* (
    blogId: BlogId,
  ) {
    const since = new Date((yield* Clock.currentTimeMillis) - 14 * 86_400_000);
    const rows = yield* execute("metrics.viewSeries", (client) =>
      client
        .select({
          day: sql<string>`to_char(date_trunc('day', ${schema.postView.occurredAt}), 'Mon DD')`,
          value: count(),
        })
        .from(schema.postView)
        .innerJoin(schema.post, eq(schema.postView.postId, schema.post.id))
        .where(
          and(
            eq(schema.post.blogId, blogId),
            gte(schema.postView.occurredAt, since),
          ),
        )
        .groupBy(sql`date_trunc('day', ${schema.postView.occurredAt})`)
        .orderBy(sql`date_trunc('day', ${schema.postView.occurredAt})`),
    );
    return rows.map((row) => ({ day: row.day, value: Number(row.value) }));
  });

  const getContentLibrary = Effect.fn("ContentQueries.getContentLibrary")(
    function* (blogId: BlogId) {
      return yield* Effect.all(
        {
          authors: getAuthors(blogId),
          categories: getCategories(blogId),
          snippets: execute("snippet.list", (client) =>
            client.query.snippet.findMany({
              where: eq(schema.snippet.blogId, blogId),
            }),
          ).pipe(Effect.map((rows) => rows.map(toSnippet))),
          redirects: execute("redirect.list", (client) =>
            client.query.redirect.findMany({
              where: eq(schema.redirect.blogId, blogId),
            }),
          ).pipe(Effect.map((rows) => rows.map(toRedirect))),
        },
        { concurrency: "unbounded" },
      );
    },
  );

  const getTeam = Effect.fn("ContentQueries.getTeam")(function* (
    organizationId: OrganizationId,
    blogId: BlogId,
  ) {
    const { authors, members } = yield* Effect.all(
      {
        authors: getAuthors(blogId),
        members: execute("member.list", (client) =>
          client
            .select({
              id: schema.member.id,
              userId: schema.user.id,
              name: schema.user.name,
              email: schema.user.email,
              role: schema.member.role,
            })
            .from(schema.member)
            .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
            .where(eq(schema.member.organizationId, organizationId))
            .orderBy(asc(schema.member.createdAt)),
        ),
      },
      { concurrency: "unbounded" },
    );
    return {
      authors,
      members: members.flatMap((member) => {
        const role = member.role === "member" ? "viewer" : member.role;
        return isTeamRole(role)
          ? [
              new TeamMember({
                ...member,
                id: MemberId.make(member.id),
                userId: UserId.make(member.userId),
                role,
              }),
            ]
          : [];
      }),
    };
  });

  const getPendingInvitations = Effect.fn(
    "ContentQueries.getPendingInvitations",
  )(function* (organizationId: OrganizationId) {
    const invitations = yield* execute("invitation.list", (client) =>
      client.query.invitation.findMany({
        where: and(
          eq(schema.invitation.organizationId, organizationId),
          eq(schema.invitation.status, "pending"),
        ),
        orderBy: [asc(schema.invitation.createdAt)],
      }),
    );
    return invitations.flatMap((invitation) => {
      const role = invitation.role === "member" ? "viewer" : invitation.role;
      return isTeamRole(role)
        ? [
            new WorkspaceInvitation({
              ...invitation,
              id: InvitationId.make(invitation.id),
              organizationId: OrganizationId.make(invitation.organizationId),
              inviterId: UserId.make(invitation.inviterId),
              role,
            }),
          ]
        : [];
    });
  });

  const getApiKeys = Effect.fn("ContentQueries.getApiKeys")(function* (
    blogId: BlogId,
  ) {
    const rows = yield* execute("apiKey.list", (client) =>
      client.query.apiKey.findMany({
        where: eq(schema.apiKey.blogId, blogId),
        orderBy: [desc(schema.apiKey.createdAt)],
      }),
    );
    return rows.map(
      (row) =>
        new ApiKeySummary({
          ...row,
          id: ApiKeyId.make(row.id),
          blogId: BlogId.make(row.blogId),
        }),
    );
  });

  const getAuditLog = Effect.fn("ContentQueries.getAuditLog")(function* (
    organizationId: OrganizationId,
  ) {
    const rows = yield* execute("auditLog.list", (client) =>
      client
        .select({
          audit: schema.auditLog,
          actorName: schema.user.name,
          actorEmail: schema.user.email,
          publicationName: schema.blog.name,
        })
        .from(schema.auditLog)
        .leftJoin(schema.user, eq(schema.auditLog.actorId, schema.user.id))
        .leftJoin(schema.blog, eq(schema.auditLog.blogId, schema.blog.id))
        .where(eq(schema.auditLog.organizationId, organizationId))
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(100),
    );
    return rows.map(
      ({ audit, actorName, actorEmail, publicationName }) =>
        new AuditEntry({
          ...audit,
          id: AuditLogId.make(audit.id),
          organizationId,
          blogId: audit.blogId ? BlogId.make(audit.blogId) : null,
          actorId: audit.actorId ? UserId.make(audit.actorId) : null,
          actorName,
          actorEmail,
          publicationName,
        }),
    );
  });

  const getPublicBlog = Effect.fn("ContentQueries.getPublicBlog")(function* (
    slug: BlogSlug,
  ) {
    const row = yield* execute("blog.getPublic", (client) =>
      client.query.blog.findFirst({ where: eq(schema.blog.slug, slug) }),
    );
    return row
      ? yield* decodeBlog(row).pipe(
          persistenceError("publication.decodePublic"),
        )
      : undefined;
  });

  const getPublicAuthor = Effect.fn("ContentQueries.getPublicAuthor")(
    function* (blogId: BlogId, slug: string) {
      const row = yield* execute("author.getPublic", (client) =>
        client.query.author.findFirst({
          where: and(
            eq(schema.author.blogId, blogId),
            eq(schema.author.slug, slug),
          ),
        }),
      );
      return row ? toAuthor(row) : undefined;
    },
  );

  const getPublicPosts = Effect.fn("ContentQueries.getPublicPosts")(function* (
    blogId: BlogId,
    options: PublicPostOptions = {},
  ) {
    const now = new Date(yield* Clock.currentTimeMillis);
    const rows = yield* execute("post.listPublic", (client) => {
      const filters = [
        eq(schema.post.blogId, blogId),
        eq(schema.post.status, "published"),
        isNotNull(schema.post.publishedAt),
        lte(schema.post.publishedAt, now),
      ];
      if (options.search?.trim()) {
        filters.push(
          sql<boolean>`to_tsvector('simple', ${schema.post.title} || ' ' || ${schema.post.excerpt} || ' ' || ${schema.post.contentMarkdown}) @@ plainto_tsquery('simple', ${options.search.trim()})`,
        );
      }
      if (options.authorId) {
        filters.push(eq(schema.post.authorId, options.authorId));
      }
      if (options.category) {
        filters.push(
          exists(
            client
              .select({ id: schema.postCategory.postId })
              .from(schema.postCategory)
              .innerJoin(
                schema.category,
                eq(schema.postCategory.categoryId, schema.category.id),
              )
              .where(
                and(
                  eq(schema.postCategory.postId, schema.post.id),
                  eq(schema.category.blogId, blogId),
                  eq(schema.category.slug, options.category),
                ),
              ),
          ),
        );
      }
      return client.query.post.findMany({
        where: and(...filters),
        with: { author: true, categories: { with: { category: true } } },
        orderBy: [desc(schema.post.featured), desc(schema.post.publishedAt)],
        ...(options.limit === null ? {} : { limit: options.limit ?? 50 }),
        ...(options.offset === undefined ? {} : { offset: options.offset }),
      });
    });
    return rows.map(toPublicPost);
  });

  const getPublicPost = Effect.fn("ContentQueries.getPublicPost")(function* (
    blogId: BlogId,
    slug: string,
  ) {
    const now = new Date(yield* Clock.currentTimeMillis);
    const row = yield* execute("post.getPublic", (client) =>
      client.query.post.findFirst({
        where: and(
          eq(schema.post.blogId, blogId),
          eq(schema.post.slug, slug),
          eq(schema.post.status, "published"),
          isNotNull(schema.post.publishedAt),
          lte(schema.post.publishedAt, now),
        ),
        with: { author: true, categories: { with: { category: true } } },
      }),
    );
    return row ? toPublicPost(row) : undefined;
  });

  const getPublicRedirect = Effect.fn("ContentQueries.getPublicRedirect")(
    function* (blogId: BlogId, fromPath: string) {
      const row = yield* execute("redirect.getPublic", (client) =>
        client.query.redirect.findFirst({
          where: and(
            eq(schema.redirect.blogId, blogId),
            eq(schema.redirect.fromPath, fromPath),
          ),
        }),
      );
      return row?.toPath;
    },
  );

  const getPublicRedirects = Effect.fn("ContentQueries.getPublicRedirects")(
    function* (blogId: BlogId) {
      const rows = yield* execute("redirect.listPublic", (client) =>
        client.query.redirect.findMany({
          where: eq(schema.redirect.blogId, blogId),
          orderBy: [asc(schema.redirect.fromPath)],
        }),
      );
      return rows.map(toRedirect);
    },
  );

  const getMediaExport = Effect.fn("ContentQueries.getMediaExport")(function* (
    blogId: BlogId,
  ) {
    return yield* execute("mediaAsset.listExport", (client) =>
      client.query.mediaAsset.findMany({
        where: eq(schema.mediaAsset.blogId, blogId),
        with: {
          variants: true,
          coverPosts: { columns: { id: true, title: true, slug: true } },
        },
        orderBy: [asc(schema.mediaAsset.createdAt)],
      }),
    );
  });

  const recordPostView = Effect.fn("ContentQueries.recordPostView")(function* (
    postId: PostId,
    eventId: string,
    referrer: string | null,
  ) {
    const now = new Date(yield* Clock.currentTimeMillis);
    return yield* execute("postView.create", (client) =>
      client.transaction(async (transaction) => {
        const [publicPost] = await transaction
          .select({ id: schema.post.id })
          .from(schema.post)
          .where(
            and(
              eq(schema.post.id, postId),
              eq(schema.post.status, "published"),
              isNotNull(schema.post.publishedAt),
              lte(schema.post.publishedAt, now),
            ),
          )
          .for("update");
        if (!publicPost) return false;
        await transaction
          .insert(schema.postView)
          .values({ postId, eventId, referrer })
          .onConflictDoNothing({ target: schema.postView.eventId });
        return true;
      }),
    );
  });

  return {
    getAuthors,
    getCategories,
    getDashboardPosts,
    getDashboardPost,
    getDashboardMetrics,
    getViewSeries,
    getContentLibrary,
    getTeam,
    getPendingInvitations,
    getApiKeys,
    getAuditLog,
    getPublicBlog,
    getPublicAuthor,
    getPublicPosts,
    getPublicPost,
    getPublicRedirect,
    getPublicRedirects,
    getMediaExport,
    recordPostView,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/ContentQueries",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export * as ContentQueries from "./content-queries";
