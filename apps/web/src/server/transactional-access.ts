import { hasPermission, isTeamRole, type Permission } from "@prosewire/core";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, eq } from "drizzle-orm";
import { ApiAccess, hasScope } from "./api-access.ts";
import {
  BlogAuthorization,
  WorkspaceAuthorization,
} from "./authorization-models.ts";
import { toBlog, toWorkspace } from "./content-models.ts";
import {
  type ApiKeyId,
  type BlogId,
  MemberId,
  OrganizationId,
  type UserId,
} from "./domain.ts";

export type TransactionClient = Parameters<Parameters<Db["transaction"]>[0]>[0];

function role(value: string) {
  const normalized = value === "member" ? "viewer" : value;
  return isTeamRole(normalized) ? normalized : undefined;
}

export async function lockWorkspaceAuthorization(
  transaction: TransactionClient,
  organizationId: OrganizationId,
  userId: UserId,
  capability: Permission,
): Promise<WorkspaceAuthorization | undefined> {
  const rows = await transaction
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
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.userId, userId),
      ),
    )
    .for("share");
  const row = rows[0];
  const normalizedRole = row ? role(row.role) : undefined;
  if (!row || !normalizedRole || !hasPermission(normalizedRole, capability)) {
    return undefined;
  }
  return new WorkspaceAuthorization({
    workspace: toWorkspace(row.workspace),
    memberId: MemberId.make(row.memberId),
    role: normalizedRole,
  });
}

export async function lockBlogAuthorization(
  transaction: TransactionClient,
  blogId: BlogId,
  userId: UserId,
  capability: Permission,
): Promise<BlogAuthorization | undefined> {
  const rows = await transaction
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
    .where(eq(schema.blog.id, blogId))
    .for("share");
  const row = rows[0];
  const normalizedRole = row ? role(row.role) : undefined;
  if (!row || !normalizedRole || !hasPermission(normalizedRole, capability)) {
    return undefined;
  }
  return new BlogAuthorization({
    blog: toBlog(row.blog),
    workspace: toWorkspace(row.workspace),
    memberId: MemberId.make(row.memberId),
    role: normalizedRole,
  });
}

export async function lockApiKey(
  transaction: TransactionClient,
  blogId: BlogId,
  keyId: ApiKeyId,
) {
  const rows = await transaction
    .select({
      key: schema.apiKey,
      organizationId: schema.blog.organizationId,
      blogSlug: schema.blog.slug,
      locale: schema.blog.locale,
      locales: schema.blog.locales,
    })
    .from(schema.apiKey)
    .innerJoin(schema.blog, eq(schema.apiKey.blogId, schema.blog.id))
    .where(and(eq(schema.apiKey.id, keyId), eq(schema.apiKey.blogId, blogId)))
    .for("share");
  return rows[0];
}

export async function lockApiWrite(
  transaction: TransactionClient,
  blogId: BlogId,
  keyId: ApiKeyId,
  now: Date,
) {
  const authorization = await lockApiKey(transaction, blogId, keyId);
  if (
    !authorization ||
    (authorization.key.expiresAt && authorization.key.expiresAt <= now)
  ) {
    return {
      error: new ApiAccess.AuthenticationFailed({
        message: "Invalid or expired API key",
      }),
    } as const;
  }
  if (!hasScope(authorization.key.scopes, "content:write")) {
    return {
      error: new ApiAccess.ScopeDenied({ requiredScope: "content:write" }),
    } as const;
  }
  return {
    organizationId: OrganizationId.make(authorization.organizationId),
    blogSlug: authorization.blogSlug,
    locale: authorization.locale,
    locales: authorization.locales,
  } as const;
}

export * as TransactionalAccess from "./transactional-access";
