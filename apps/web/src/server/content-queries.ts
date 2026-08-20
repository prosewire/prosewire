import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { Clock, Context, Effect, Layer } from "effect";
import { isTeamRole } from "@prosewire/core";
import * as schema from "@prosewire/db/schema";
import {
  ApiKeySummary,
  AuditEntry,
  TeamMember,
  WorkspaceInvitation,
  toAuthor,
  toBlog,
  toCategory,
  toDashboardPost,
  toDashboardPostDetail,
  toPublicPost,
  toRedirect,
  toSnippet,
} from "./content-models.ts";
import { Database } from "./database.ts";
import {
  ApiKeyId,
  AuditLogId,
  BlogId,
  InvitationId,
  MemberId,
  OrganizationId,
  UserId,
  type BlogSlug,
  type PostId,
} from "./domain.ts";

export interface PublicPostOptions {
  readonly search?: string;
  readonly category?: string;
  readonly limit?: number;
}

export const create = Effect.fn("ContentQueries.create")(function* () {
  const database = yield* Database;
  const execute = database.execute;

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

  const getDashboardPosts = Effect.fn("ContentQueries.getDashboardPosts")(function* (
    blogId: BlogId,
    search?: string,
  ) {
    const rows = yield* execute("post.listDashboard", (client) =>
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
          views: true,
        },
        orderBy: [desc(schema.post.updatedAt)],
      }),
    );
    return rows.map(toDashboardPost);
  });

  const getDashboardPost = Effect.fn("ContentQueries.getDashboardPost")(function* (
    id: PostId,
  ) {
    const row = yield* execute("post.getDashboard", (client) =>
      client.query.post.findFirst({
        where: eq(schema.post.id, id),
        with: {
          author: true,
          categories: { with: { category: true } },
          revisions: true,
        },
      }),
    );
    return row ? toDashboardPostDetail(row) : undefined;
  });

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
              .innerJoin(schema.post, eq(schema.postView.postId, schema.post.id))
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
    const rows = yield* execute("metrics.viewSeries", (client) =>
      client
        .select({
          day: sql<string>`to_char(date_trunc('day', ${schema.postView.occurredAt}), 'Mon DD')`,
          value: count(),
        })
        .from(schema.postView)
        .innerJoin(schema.post, eq(schema.postView.postId, schema.post.id))
        .where(eq(schema.post.blogId, blogId))
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
    const { authors, members, invitations } = yield* Effect.all(
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
        invitations: execute("invitation.list", (client) =>
          client.query.invitation.findMany({
            where: and(
              eq(schema.invitation.organizationId, organizationId),
              eq(schema.invitation.status, "pending"),
            ),
            orderBy: [asc(schema.invitation.createdAt)],
          }),
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
      invitations: invitations.flatMap((invitation) => {
        const role =
          invitation.role === "member" ? "viewer" : invitation.role;
        return isTeamRole(role)
          ? [
              new WorkspaceInvitation({
                ...invitation,
                id: InvitationId.make(invitation.id),
                organizationId: OrganizationId.make(
                  invitation.organizationId,
                ),
                inviterId: UserId.make(invitation.inviterId),
                role,
              }),
            ]
          : [];
      }),
    };
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
    return row ? toBlog(row) : undefined;
  });

  const getPublicAuthor = Effect.fn("ContentQueries.getPublicAuthor")(function* (
    blogId: BlogId,
    slug: string,
  ) {
    const row = yield* execute("author.getPublic", (client) =>
      client.query.author.findFirst({
        where: and(
          eq(schema.author.blogId, blogId),
          eq(schema.author.slug, slug),
        ),
      }),
    );
    return row ? toAuthor(row) : undefined;
  });

  const getPublicPosts = Effect.fn("ContentQueries.getPublicPosts")(function* (
    blogId: BlogId,
    options: PublicPostOptions = {},
  ) {
    const now = new Date(yield* Clock.currentTimeMillis);
    const filters = [
      eq(schema.post.blogId, blogId),
      eq(schema.post.status, "published"),
      isNotNull(schema.post.publishedAt),
      lte(schema.post.publishedAt, now),
    ];
    if (options.search?.trim()) {
      filters.push(
        sql<boolean>`to_tsvector('english', ${schema.post.title} || ' ' || ${schema.post.excerpt} || ' ' || ${schema.post.contentMarkdown}) @@ plainto_tsquery('english', ${options.search.trim()})`,
      );
    }
    const rows = yield* execute("post.listPublic", (client) =>
      client.query.post.findMany({
        where: and(...filters),
        with: { author: true, categories: { with: { category: true } } },
        orderBy: [desc(schema.post.featured), desc(schema.post.publishedAt)],
        limit: options.limit ?? 50,
      }),
    );
    const posts = rows.map(toPublicPost);
    if (!options.category) return posts;
    return posts.filter((row) =>
      row.categories.some((entry) => entry.category.slug === options.category),
    );
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

  const recordPostView = Effect.fn("ContentQueries.recordPostView")(function* (
    postId: PostId,
    referrer: string | null,
  ) {
    yield* execute("postView.create", (client) =>
      client.insert(schema.postView).values({ postId, referrer }),
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
    getApiKeys,
    getAuditLog,
    getPublicBlog,
    getPublicAuthor,
    getPublicPosts,
    getPublicPost,
    recordPostView,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/ContentQueries",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as ContentQueries from "./content-queries";
