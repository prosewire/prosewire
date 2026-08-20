import { and, asc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import {
  canUpdatePost,
  hasPermission,
  isTeamRole,
  type Permission,
  type TeamRole as CoreTeamRole,
} from "@prosewire/core";
import * as schema from "@prosewire/db/schema";
import {
  Blog,
  TeamRole,
  Workspace,
  toBlog,
  toWorkspace,
} from "./content-models.ts";
import { Database, type DatabaseError } from "./database.ts";
import {
  BlogId,
  MemberId,
  OrganizationId,
  UserId,
} from "./domain.ts";

export const Capability = Schema.Literals([
  "workspace:update",
  "workspace:delete",
  "members:manage",
  "publications:create",
  "publications:update",
  "publications:delete",
  "content:read",
  "content:create",
  "content:update:any",
  "content:update:own",
  "content:publish",
  "content:archive",
  "analytics:read",
  "integrations:read",
  "integrations:manage",
  "audit:read",
]);
export type Capability = typeof Capability.Type;

export class WorkspaceAccessDenied extends Schema.TaggedError<WorkspaceAccessDenied>()(
  "WorkspaceAccessDenied",
  {
    organizationId: OrganizationId,
    userId: UserId,
    capability: Capability,
  },
) {
  override get message(): string {
    return `User ${this.userId} cannot ${this.capability} workspace ${this.organizationId}`;
  }
}

export class BlogAccessDenied extends Schema.TaggedError<BlogAccessDenied>()(
  "BlogAccessDenied",
  {
    blogId: BlogId,
    userId: UserId,
    capability: Capability,
  },
) {
  override get message(): string {
    return `User ${this.userId} cannot ${this.capability} publication ${this.blogId}`;
  }
}

export class NoWorkspaceAvailable extends Schema.TaggedError<NoWorkspaceAvailable>()(
  "NoWorkspaceAvailable",
  { userId: UserId },
) {
  override get message(): string {
    return `User ${this.userId} does not belong to a workspace`;
  }
}

export class NoPublicationAvailable extends Schema.TaggedError<NoPublicationAvailable>()(
  "NoPublicationAvailable",
  { organizationId: OrganizationId },
) {
  override get message(): string {
    return `Workspace ${this.organizationId} does not have a publication`;
  }
}

export class WorkspaceAuthorization extends Schema.Class<WorkspaceAuthorization>(
  "Authorization.WorkspaceAuthorization",
)({
  workspace: Workspace,
  memberId: MemberId,
  role: TeamRole,
}) {}

export class BlogAuthorization extends Schema.Class<BlogAuthorization>(
  "Authorization.BlogAuthorization",
)({
  workspace: Workspace,
  blog: Blog,
  memberId: MemberId,
  role: TeamRole,
}) {}

export class DashboardContext extends Schema.Class<DashboardContext>(
  "Authorization.DashboardContext",
)({
  userId: UserId,
  workspace: Workspace,
  workspaces: Schema.Array(Workspace),
  publication: Blog,
  publications: Schema.Array(Blog),
  memberId: MemberId,
  role: TeamRole,
}) {}

export type Error =
  | DatabaseError
  | WorkspaceAccessDenied
  | BlogAccessDenied
  | NoWorkspaceAvailable
  | NoPublicationAvailable;

function normalizeRole(role: string): CoreTeamRole | undefined {
  if (role === "member") return "viewer";
  return isTeamRole(role) ? role : undefined;
}

export const create = Effect.fn("BlogAccess.create")(function* () {
  const database = yield* Database;

  const findWorkspaces = Effect.fn("BlogAccess.findWorkspaces")(function* (
    userId: UserId,
  ) {
    const rows = yield* database.execute("workspace.listAuthorized", (client) =>
      client
        .select({
          workspace: schema.organization,
          memberId: schema.member.id,
          role: schema.member.role,
        })
        .from(schema.member)
        .innerJoin(
          schema.organization,
          eq(schema.member.organizationId, schema.organization.id),
        )
        .where(eq(schema.member.userId, userId))
        .orderBy(asc(schema.organization.name)),
    );
    return rows.flatMap((row) => {
      const role = normalizeRole(row.role);
      return role
        ? [
            new WorkspaceAuthorization({
              workspace: toWorkspace(row.workspace),
              memberId: MemberId.make(row.memberId),
              role,
            }),
          ]
        : [];
    });
  });

  const findWorkspace = Effect.fn("BlogAccess.findWorkspace")(function* (
    organizationId: OrganizationId,
    userId: UserId,
  ) {
    const workspaces = yield* findWorkspaces(userId);
    return workspaces.find(
      (entry) => entry.workspace.id === organizationId,
    );
  });

  const findBlog = Effect.fn("BlogAccess.findBlog")(function* (
    blogId: BlogId,
    userId: UserId,
  ) {
    const rows = yield* database.execute("publication.findAuthorized", (client) =>
      client
        .select({
          blog: schema.blog,
          workspace: schema.organization,
          memberId: schema.member.id,
          role: schema.member.role,
        })
        .from(schema.blog)
        .innerJoin(
          schema.organization,
          eq(schema.blog.organizationId, schema.organization.id),
        )
        .innerJoin(
          schema.member,
          and(
            eq(schema.member.organizationId, schema.organization.id),
            eq(schema.member.userId, userId),
          ),
        )
        .where(eq(schema.blog.id, blogId)),
    );
    const row = rows[0];
    const role = row ? normalizeRole(row.role) : undefined;
    return row && role
      ? new BlogAuthorization({
          blog: toBlog(row.blog),
          workspace: toWorkspace(row.workspace),
          memberId: MemberId.make(row.memberId),
          role,
        })
      : undefined;
  });

  const requireWorkspaceCapability = Effect.fnUntraced(function* (
    organizationId: OrganizationId,
    userId: UserId,
    capability: Permission,
  ) {
    const authorization = yield* findWorkspace(organizationId, userId);
    if (!authorization || !hasPermission(authorization.role, capability)) {
      return yield* new WorkspaceAccessDenied({
        organizationId,
        userId,
        capability,
      });
    }
    return authorization;
  });

  const requireBlogCapability = Effect.fnUntraced(function* (
    blogId: BlogId,
    userId: UserId,
    capability: Permission,
  ) {
    const authorization = yield* findBlog(blogId, userId);
    if (!authorization || !hasPermission(authorization.role, capability)) {
      return yield* new BlogAccessDenied({ blogId, userId, capability });
    }
    return authorization;
  });

  const requireOwnedPostCapability = Effect.fnUntraced(function* (
    blogId: BlogId,
    userId: UserId,
    createdById: UserId | null,
    capability: "content:update:any" | "content:archive",
  ) {
    const authorization = yield* requireBlogCapability(
      blogId,
      userId,
      capability === "content:archive" ? "content:read" : "content:read",
    );
    const allowed =
      capability === "content:archive"
        ? hasPermission(authorization.role, "content:archive") &&
          canUpdatePost(authorization.role, createdById, userId)
        : canUpdatePost(authorization.role, createdById, userId);
    if (!allowed) {
      return yield* new BlogAccessDenied({ blogId, userId, capability });
    }
    return authorization;
  });

  const dashboardContext = Effect.fn("BlogAccess.dashboardContext")(
    function* (
      userId: UserId,
      preferredOrganizationId?: OrganizationId,
      preferredBlogId?: BlogId,
    ) {
      const authorizations = yield* findWorkspaces(userId);
      const selected =
        authorizations.find(
          (entry) => entry.workspace.id === preferredOrganizationId,
        ) ?? authorizations[0];
      if (!selected) return yield* new NoWorkspaceAvailable({ userId });
      if (!hasPermission(selected.role, "content:read")) {
        return yield* new WorkspaceAccessDenied({
          organizationId: selected.workspace.id,
          userId,
          capability: "content:read",
        });
      }
      const rows = yield* database.execute("publication.listForWorkspace", (client) =>
        client.query.blog.findMany({
          where: eq(schema.blog.organizationId, selected.workspace.id),
          orderBy: [asc(schema.blog.name)],
        }),
      );
      const publications = rows.map(toBlog);
      const publication =
        publications.find((entry) => entry.id === preferredBlogId) ??
        publications[0];
      if (!publication) {
        return yield* new NoPublicationAvailable({
          organizationId: selected.workspace.id,
        });
      }
      return new DashboardContext({
        userId,
        workspace: selected.workspace,
        workspaces: authorizations.map((entry) => entry.workspace),
        publication,
        publications,
        memberId: selected.memberId,
        role: selected.role,
      });
    },
  );

  return {
    findWorkspaces,
    findWorkspace,
    findBlog,
    dashboardContext,
    requireRead: Effect.fn("BlogAccess.requireRead")(
      (blogId: BlogId, userId: UserId) =>
        requireBlogCapability(blogId, userId, "content:read"),
    ),
    requirePostCreate: Effect.fn("BlogAccess.requirePostCreate")(
      (blogId: BlogId, userId: UserId) =>
        requireBlogCapability(blogId, userId, "content:create"),
    ),
    requirePostUpdate: Effect.fn("BlogAccess.requirePostUpdate")(
      (blogId: BlogId, userId: UserId, createdById: UserId | null) =>
        requireOwnedPostCapability(
          blogId,
          userId,
          createdById,
          "content:update:any",
        ),
    ),
    requirePublish: Effect.fn("BlogAccess.requirePublish")(
      (blogId: BlogId, userId: UserId) =>
        requireBlogCapability(blogId, userId, "content:publish"),
    ),
    requireArchive: Effect.fn("BlogAccess.requireArchive")(
      (blogId: BlogId, userId: UserId, createdById: UserId | null) =>
        requireOwnedPostCapability(
          blogId,
          userId,
          createdById,
          "content:archive",
        ),
    ),
    requireAnalytics: Effect.fn("BlogAccess.requireAnalytics")(
      (blogId: BlogId, userId: UserId) =>
        requireBlogCapability(blogId, userId, "analytics:read"),
    ),
    requireAuditRead: Effect.fn("BlogAccess.requireAuditRead")(
      (organizationId: OrganizationId, userId: UserId) =>
        requireWorkspaceCapability(organizationId, userId, "audit:read"),
    ),
    requireIntegrationsRead: Effect.fn("BlogAccess.requireIntegrationsRead")(
      (blogId: BlogId, userId: UserId) =>
        requireBlogCapability(blogId, userId, "integrations:read"),
    ),
    requireIntegrationsManage: Effect.fn("BlogAccess.requireIntegrationsManage")(
      (blogId: BlogId, userId: UserId) =>
        requireBlogCapability(blogId, userId, "integrations:manage"),
    ),
    requirePublicationUpdate: Effect.fn("BlogAccess.requirePublicationUpdate")(
      (blogId: BlogId, userId: UserId) =>
        requireBlogCapability(blogId, userId, "publications:update"),
    ),
    requireWorkspaceUpdate: Effect.fn("BlogAccess.requireWorkspaceUpdate")(
      (organizationId: OrganizationId, userId: UserId) =>
        requireWorkspaceCapability(organizationId, userId, "workspace:update"),
    ),
    requireMembersManage: Effect.fn("BlogAccess.requireMembersManage")(
      (organizationId: OrganizationId, userId: UserId) =>
        requireWorkspaceCapability(organizationId, userId, "members:manage"),
    ),
    requirePublicationCreate: Effect.fn("BlogAccess.requirePublicationCreate")(
      (organizationId: OrganizationId, userId: UserId) =>
        requireWorkspaceCapability(
          organizationId,
          userId,
          "publications:create",
        ),
    ),
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/BlogAccess",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as BlogAccess from "./authorization";
