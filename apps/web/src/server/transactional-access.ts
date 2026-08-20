import { and, eq } from "drizzle-orm";
import { hasPermission, isTeamRole, type Permission } from "@prosewire/core";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import {
  BlogAuthorization,
  WorkspaceAuthorization,
} from "./authorization-models.ts";
import {
  toBlog,
  toWorkspace,
} from "./content-models.ts";
import {
  MemberId,
  type ApiKeyId,
  type BlogId,
  type OrganizationId,
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
    .select({ key: schema.apiKey, organizationId: schema.blog.organizationId })
    .from(schema.apiKey)
    .innerJoin(schema.blog, eq(schema.apiKey.blogId, schema.blog.id))
    .where(and(eq(schema.apiKey.id, keyId), eq(schema.apiKey.blogId, blogId)))
    .for("share");
  return rows[0];
}

export * as TransactionalAccess from "./transactional-access";
