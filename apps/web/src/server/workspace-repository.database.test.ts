import { createHash, randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import * as EmailQueue from "@prosewire/jobs/email-queue";
import { and, eq, inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { ApiAccess } from "./api-access.ts";
import {
  configLayer,
  databaseLayer,
  databaseUrl,
} from "./database-test-support.ts";
import {
  ApiKeyId,
  BlogId,
  InvitationId,
  MemberId,
  OrganizationId,
  UserId,
} from "./domain.ts";
import { PlatformCrypto } from "./platform-crypto.ts";
import {
  CreateApiKeyInput,
  CreatePublicationInput,
  CreateWorkspaceInput,
  MemberMutationInput,
  RevokeApiKeyInput,
  UpdateMemberRoleInput,
  UpdateWorkspaceInput,
  WorkspaceManagement,
} from "./workspace-management.ts";

interface Actor {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly sessionId: string;
}

async function management(
  client: ReturnType<typeof openDb>["client"],
  url: string,
) {
  const dependencies = Layer.mergeAll(
    databaseLayer(client),
    configLayer(url),
    PlatformCrypto.layer,
    Layer.mock(EmailQueue.Service, {
      offer: () => Effect.void,
      take: () => Effect.die("Email consumption is unavailable in web tests"),
    }),
  );
  return Effect.runPromise(
    WorkspaceManagement.Service.pipe(
      Effect.provide(
        WorkspaceManagement.live.pipe(Layer.provide(dependencies)),
      ),
    ),
  );
}

async function apiAccess(client: ReturnType<typeof openDb>["client"]) {
  return Effect.runPromise(
    ApiAccess.Service.pipe(
      Effect.provide(
        ApiAccess.layer.pipe(
          Layer.provide(
            Layer.mergeAll(databaseLayer(client), PlatformCrypto.layer),
          ),
        ),
      ),
    ),
  );
}

function actor(id: UserId, email: string, sessionId: string): Actor {
  return { id, email, sessionId, name: "Ada Owner" };
}

async function cleanup(
  client: ReturnType<typeof openDb>["client"],
  organizationIds: ReadonlyArray<OrganizationId>,
  userIds: ReadonlyArray<UserId>,
) {
  if (organizationIds.length > 0) {
    await client
      .delete(schema.auditLog)
      .where(inArray(schema.auditLog.organizationId, organizationIds));
    await client
      .delete(schema.organization)
      .where(inArray(schema.organization.id, organizationIds));
  }
  if (userIds.length > 0) {
    await client.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
}

describe.skipIf(!databaseUrl)("PostgreSQL workspace repository", () => {
  it("creates the initial workspace graph and rolls it back on a publication conflict", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const actorId = UserId.make(`user-${randomUUID()}`);
    const sessionId = `session-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    const conflictingOrganizationId = OrganizationId.make(
      `workspace-${randomUUID()}`,
    );
    const createdOrganizationIds: OrganizationId[] = [];

    try {
      await resource.client.insert(schema.user).values({
        id: actorId,
        email,
        name: "Ada Owner",
      });
      await resource.client.insert(schema.session).values({
        id: sessionId,
        userId: actorId,
        token: `token-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await resource.client.insert(schema.organization).values({
        id: conflictingOrganizationId,
        name: "Existing workspace",
        slug: `existing-${randomUUID()}`,
      });
      await resource.client.insert(schema.blog).values({
        organizationId: conflictingOrganizationId,
        name: "Existing publication",
        slug: "database-workspace-conflict",
      });

      const service = await management(resource.client, databaseUrl);
      const created = await Effect.runPromise(
        service.createWorkspace(
          new CreateWorkspaceInput({
            workspaceName: "Research Studio",
            workspaceSlug: "",
            publicationName: "Field Notes",
            publicationSlug: "",
          }),
          actor(actorId, email, sessionId),
        ),
      );
      createdOrganizationIds.push(created.organizationId);

      const [workspace, membership, publication, authorRow, session, audits] =
        await Promise.all([
          resource.client.query.organization.findFirst({
            where: eq(schema.organization.id, created.organizationId),
          }),
          resource.client.query.member.findFirst({
            where: and(
              eq(schema.member.organizationId, created.organizationId),
              eq(schema.member.userId, actorId),
            ),
          }),
          resource.client.query.blog.findFirst({
            where: eq(schema.blog.id, created.blogId),
          }),
          resource.client.query.author.findFirst({
            where: and(
              eq(schema.author.blogId, created.blogId),
              eq(schema.author.userId, actorId),
            ),
          }),
          resource.client.query.session.findFirst({
            where: eq(schema.session.id, sessionId),
          }),
          resource.client.query.auditLog.findMany({
            where: eq(schema.auditLog.organizationId, created.organizationId),
          }),
        ]);

      expect(workspace).toMatchObject({
        name: "Research Studio",
        slug: "research-studio",
      });
      expect(membership?.role).toBe("owner");
      expect(publication).toMatchObject({
        name: "Field Notes",
        slug: "field-notes",
      });
      expect(authorRow).toMatchObject({ name: "Ada Owner", slug: "ada-owner" });
      expect(session?.activeOrganizationId).toBe(created.organizationId);
      expect(audits.map(({ action }) => action).sort()).toEqual([
        "publication.created",
        "workspace.created",
      ]);

      const failedWorkspaceSlug = `failed-${randomUUID()}`;
      const failure = await Effect.runPromise(
        Effect.flip(
          service.createWorkspace(
            new CreateWorkspaceInput({
              workspaceName: "Must roll back",
              workspaceSlug: failedWorkspaceSlug,
              publicationName: "Conflicting publication",
              publicationSlug: "database-workspace-conflict",
            }),
            actor(actorId, email, sessionId),
          ),
        ),
      );
      expect(failure).toMatchObject({
        _tag: "WorkspaceRepositoryPersistenceError",
        operation: "workspace.create",
      });
      await expect(
        resource.client.query.organization.findFirst({
          where: eq(schema.organization.slug, failedWorkspaceSlug),
        }),
      ).resolves.toBeUndefined();
    } finally {
      await cleanup(
        resource.client,
        [...createdOrganizationIds, conflictingOrganizationId],
        [actorId],
      );
      await resource.close();
    }
  });

  it("updates and switches only authorized workspaces and publications", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const ownerId = UserId.make(`user-${randomUUID()}`);
    const outsiderId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const originalBlogId = BlogId.make(randomUUID());
    const ownerSessionId = `session-${randomUUID()}`;
    const outsiderSessionId = `session-${randomUUID()}`;
    const ownerEmail = `${randomUUID()}@example.com`;
    const outsiderEmail = `${randomUUID()}@example.com`;

    try {
      await resource.client.insert(schema.user).values([
        { id: ownerId, email: ownerEmail, name: "Ada Owner" },
        { id: outsiderId, email: outsiderEmail, name: "Outside User" },
      ]);
      await resource.client.insert(schema.session).values([
        {
          id: ownerSessionId,
          userId: ownerId,
          token: `token-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          id: outsiderSessionId,
          userId: outsiderId,
          token: `token-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Original workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values({
        id: `member-${randomUUID()}`,
        organizationId,
        userId: ownerId,
        role: "owner",
      });
      await resource.client.insert(schema.blog).values({
        id: originalBlogId,
        organizationId,
        name: "Original publication",
        slug: `blog-${randomUUID()}`,
      });

      const service = await management(resource.client, databaseUrl);
      const owner = actor(ownerId, ownerEmail, ownerSessionId);
      const outsider = actor(outsiderId, outsiderEmail, outsiderSessionId);
      await Effect.runPromise(
        service.updateWorkspace(
          new UpdateWorkspaceInput({
            organizationId,
            name: "Renamed workspace",
          }),
          owner,
        ),
      );
      const createdBlogId = await Effect.runPromise(
        service.createPublication(
          new CreatePublicationInput({
            organizationId,
            name: "Second publication",
            slug: "second-publication",
          }),
          owner,
        ),
      );
      const selectedBlogId = await Effect.runPromise(
        service.switchWorkspace(organizationId, owner),
      );
      const selected = await Effect.runPromise(
        service.switchPublication(createdBlogId, owner),
      );
      const denied = await Effect.runPromise(
        Effect.flip(
          service.createPublication(
            new CreatePublicationInput({
              organizationId,
              name: "Unauthorized",
              slug: "unauthorized-publication",
            }),
            outsider,
          ),
        ),
      );

      expect(selectedBlogId).toBeDefined();
      expect([originalBlogId, createdBlogId]).toContain(selectedBlogId);
      expect(selected.blog.id).toBe(createdBlogId);
      expect(denied).toMatchObject({
        _tag: "WorkspaceAccessDenied",
        capability: "publications:create",
      });
      const workspace = await resource.client.query.organization.findFirst({
        where: eq(schema.organization.id, organizationId),
      });
      const session = await resource.client.query.session.findFirst({
        where: eq(schema.session.id, ownerSessionId),
      });
      const unauthorized = await resource.client.query.blog.findFirst({
        where: eq(schema.blog.slug, "unauthorized-publication"),
      });
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.organizationId, organizationId),
      });
      expect(workspace?.name).toBe("Renamed workspace");
      expect(session?.activeOrganizationId).toBe(organizationId);
      expect(unauthorized).toBeUndefined();
      expect(audits.map(({ action }) => action).sort()).toEqual([
        "publication.created",
        "workspace.updated",
      ]);
    } finally {
      await cleanup(resource.client, [organizationId], [ownerId, outsiderId]);
      await resource.close();
    }
  });

  it("updates and removes members while protecting owners and the acting member", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const ownerId = UserId.make(`user-${randomUUID()}`);
    const targetId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const ownerMemberId = MemberId.make(`member-${randomUUID()}`);
    const targetMemberId = MemberId.make(`member-${randomUUID()}`);
    const sessionId = `session-${randomUUID()}`;
    const ownerEmail = `${randomUUID()}@example.com`;

    try {
      await resource.client.insert(schema.user).values([
        { id: ownerId, email: ownerEmail, name: "Ada Owner" },
        {
          id: targetId,
          email: `${randomUUID()}@example.com`,
          name: "Team member",
        },
      ]);
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Team workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values([
        {
          id: ownerMemberId,
          organizationId,
          userId: ownerId,
          role: "owner",
        },
        {
          id: targetMemberId,
          organizationId,
          userId: targetId,
          role: "viewer",
        },
      ]);

      const service = await management(resource.client, databaseUrl);
      const owner = actor(ownerId, ownerEmail, sessionId);
      await Effect.runPromise(
        service.updateMemberRole(
          new UpdateMemberRoleInput({
            organizationId,
            memberId: targetMemberId,
            role: "editor",
          }),
          owner,
        ),
      );
      const protectedOwner = await Effect.runPromise(
        Effect.flip(
          service.updateMemberRole(
            new UpdateMemberRoleInput({
              organizationId,
              memberId: ownerMemberId,
              role: "admin",
            }),
            owner,
          ),
        ),
      );
      await Effect.runPromise(
        service.removeMember(
          new MemberMutationInput({ organizationId, memberId: targetMemberId }),
          owner,
        ),
      );
      const protectedSelf = await Effect.runPromise(
        Effect.flip(
          service.removeMember(
            new MemberMutationInput({
              organizationId,
              memberId: ownerMemberId,
            }),
            owner,
          ),
        ),
      );

      expect(protectedOwner).toMatchObject({ _tag: "ProtectedMember" });
      expect(protectedSelf).toMatchObject({ _tag: "ProtectedMember" });
      const members = await resource.client.query.member.findMany({
        where: eq(schema.member.organizationId, organizationId),
      });
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.organizationId, organizationId),
      });
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({ id: ownerMemberId, role: "owner" });
      expect(audits.map(({ action }) => action).sort()).toEqual([
        "member.removed",
        "member.role_updated",
      ]);
    } finally {
      await cleanup(resource.client, [organizationId], [ownerId, targetId]);
      await resource.close();
    }
  });

  it("creates usable hashed API keys and revokes them with an audit trail", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const ownerId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const ownerEmail = `${randomUUID()}@example.com`;

    try {
      await resource.client.insert(schema.user).values({
        id: ownerId,
        email: ownerEmail,
        name: "Ada Owner",
      });
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Integration workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values({
        id: `member-${randomUUID()}`,
        organizationId,
        userId: ownerId,
        role: "owner",
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "API publication",
        slug: `blog-${randomUUID()}`,
      });

      const service = await management(resource.client, databaseUrl);
      const token = await Effect.runPromise(
        service.createApiKey(
          new CreateApiKeyInput({
            blogId,
            name: "Automation",
            allowWrite: true,
          }),
          actor(ownerId, ownerEmail, `session-${randomUUID()}`),
        ),
      );
      const persisted = await resource.client.query.apiKey.findFirst({
        where: eq(schema.apiKey.blogId, blogId),
      });
      expect(token).toMatch(/^pw_/);
      expect(persisted).toMatchObject({
        name: "Automation",
        prefix: token.slice(0, 10),
        scopes: ["content:read", "content:write"],
        keyHash: createHash("sha256").update(token).digest("hex"),
      });

      const access = await apiAccess(resource.client);
      await expect(
        Effect.runPromise(access.authenticate(token, "content:write")),
      ).resolves.toMatchObject({ blogId, keyId: persisted?.id });
      const apiKeyId = ApiKeyId.make(persisted?.id ?? "missing");
      await Effect.runPromise(
        service.revokeApiKey(
          new RevokeApiKeyInput({ blogId, apiKeyId }),
          actor(ownerId, ownerEmail, `session-${randomUUID()}`),
        ),
      );
      const revoked = await Effect.runPromise(
        Effect.flip(access.authenticate(token, "content:read")),
      );
      expect(revoked).toBeInstanceOf(ApiAccess.AuthenticationFailed);
      await expect(
        resource.client.query.apiKey.findFirst({
          where: eq(schema.apiKey.id, apiKeyId),
        }),
      ).resolves.toBeUndefined();
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.blogId, blogId),
      });
      expect(audits.map(({ action }) => action).sort()).toEqual([
        "api_key.created",
        "api_key.revoked",
      ]);
    } finally {
      await cleanup(resource.client, [organizationId], [ownerId]);
      await resource.close();
    }
  });

  it("returns invitation details only for a matching pending unexpired row", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const inviterId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const pendingId = InvitationId.make(`invitation-${randomUUID()}`);
    const expiredId = InvitationId.make(`invitation-${randomUUID()}`);
    const canceledId = InvitationId.make(`invitation-${randomUUID()}`);
    const email = `${randomUUID()}@example.com`;

    try {
      await resource.client.insert(schema.user).values({
        id: inviterId,
        email: `${randomUUID()}@example.com`,
        name: "Inviter",
      });
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Invitation workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.invitation).values([
        {
          id: pendingId,
          organizationId,
          email,
          role: "editor",
          inviterId,
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          id: expiredId,
          organizationId,
          email: `${randomUUID()}@example.com`,
          role: "viewer",
          inviterId,
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          id: canceledId,
          organizationId,
          email: `${randomUUID()}@example.com`,
          role: "viewer",
          status: "canceled",
          inviterId,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      const service = await management(resource.client, databaseUrl);
      const details = await Effect.runPromise(
        service.invitationDetails(pendingId, email),
      );
      const wrongEmail = await Effect.runPromise(
        service.invitationDetails(pendingId, "wrong@example.com"),
      );
      const expired = await Effect.runPromise(
        service.invitationDetails(expiredId),
      );
      const canceled = await Effect.runPromise(
        service.invitationDetails(canceledId),
      );

      expect(details?.invitation).toMatchObject({
        id: pendingId,
        organizationId,
        email,
        role: "editor",
      });
      expect(details?.workspace.id).toBe(organizationId);
      expect(wrongEmail).toBeUndefined();
      expect(expired).toBeUndefined();
      expect(canceled).toBeUndefined();
    } finally {
      await cleanup(resource.client, [organizationId], [inviterId]);
      await resource.close();
    }
  });
});
