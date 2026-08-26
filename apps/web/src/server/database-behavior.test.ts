import { createHash, randomUUID } from "node:crypto";
import { type Db, openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Effect, Layer, Redacted } from "effect";
import { describe, expect, it } from "vitest";
import { ApiAccess } from "./api-access.ts";
import {
  makeRegistrationInvitationLookup,
  requireRegistrationInvitation,
} from "./auth-service.ts";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { Database, DatabaseError } from "./database.ts";
import {
  ApiKeyId,
  AuthorId,
  BlogId,
  InvitationId,
  OrganizationId,
  PostId,
  UserId,
} from "./domain.ts";
import { PlatformCrypto } from "./platform-crypto.ts";
import {
  ArchivePostsCommand,
  Publishing,
  UpdatePostCommand,
} from "./publishing.ts";
import {
  InvitationMutationInput,
  InviteMemberInput,
  WorkspaceManagement,
} from "./workspace-management.ts";

const databaseUrl = process.env["DATABASE_URL"];

function databaseLayer(client: Db) {
  return Layer.succeed(Database, {
    client: Effect.succeed(client),
    execute: (operation, evaluate) =>
      Effect.tryPromise({
        try: () => evaluate(client),
        catch: (cause) => new DatabaseError({ operation, cause }),
      }),
  });
}

function configLayer(url: string) {
  return Layer.succeed(WebConfig, {
    defaultBlog: "fieldnotes",
    publicUrl: "http://localhost:3000",
    databaseUrl: Redacted.make(url),
    authSecret: Redacted.make("test-secret-at-least-32-characters"),
    allowSignUp: false,
    environment: "test",
  });
}

async function workspaceManagement(client: Db, url: string) {
  const dependencies = Layer.mergeAll(
    databaseLayer(client),
    configLayer(url),
    PlatformCrypto.layer,
  );
  return Effect.runPromise(
    WorkspaceManagement.Service.pipe(
      Effect.provide(
        WorkspaceManagement.live.pipe(Layer.provide(dependencies)),
      ),
    ),
  );
}

async function publishing(client: Db) {
  return Effect.runPromise(
    Publishing.Service.pipe(
      Effect.provide(
        Publishing.live.pipe(Layer.provide(databaseLayer(client))),
      ),
    ),
  );
}

async function blogAccess(client: Db) {
  return Effect.runPromise(
    BlogAccess.Service.pipe(
      Effect.provide(
        BlogAccess.layer.pipe(Layer.provide(databaseLayer(client))),
      ),
    ),
  );
}

async function apiAccess(client: Db) {
  const dependencies = Layer.mergeAll(
    databaseLayer(client),
    PlatformCrypto.layer,
  );
  return Effect.runPromise(
    ApiAccess.Service.pipe(
      Effect.provide(ApiAccess.layer.pipe(Layer.provide(dependencies))),
    ),
  );
}

function withApplicationName(url: string, applicationName: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("application_name", applicationName);
  return parsed.toString();
}

async function waitForBlockedAttempts(
  observer: Db,
  applicationName: string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await observer.$client.query<{ blocked: number }>(
      `select count(*)::int as blocked
         from pg_stat_activity
        where application_name = $1
          and state = 'active'
          and wait_event_type = 'Lock'`,
      [applicationName],
    );
    if (result.rows[0]?.blocked === 2) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Both invitation attempts did not reach the row lock");
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!databaseUrl)("PostgreSQL-backed repository behavior", () => {
  it("serializes concurrent invitations for the same workspace and email", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const applicationName = `prosewire-invite-${randomUUID()}`;
    const serviceUrl = withApplicationName(databaseUrl, applicationName);
    const resource = openDb(serviceUrl);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const actorId = UserId.make(`user-${randomUUID()}`);
    const recipient = `${randomUUID()}@example.com`;
    const locked = deferred();
    const release = deferred();
    let blockingTransaction: Promise<void> | undefined;
    let attempts: ReadonlyArray<Promise<unknown>> = [];

    try {
      await resource.client.insert(schema.user).values({
        id: actorId,
        email: `${randomUUID()}@example.com`,
        name: "Workspace owner",
      });
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Studio & Partners",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values({
        id: `member-${randomUUID()}`,
        organizationId,
        userId: actorId,
        role: "owner",
      });

      const management = await workspaceManagement(resource.client, serviceUrl);
      const actor = {
        id: actorId,
        name: "A <script>alert(1)</script>",
        email: `${randomUUID()}@example.com`,
        sessionId: `session-${randomUUID()}`,
      };
      const input = new InviteMemberInput({
        organizationId,
        email: recipient,
        role: "editor",
      });
      const advisoryKey = `${organizationId}:${recipient}`;

      blockingTransaction = resource.client.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${advisoryKey}, 0))`,
        );
        locked.resolve();
        await release.promise;
      });
      await locked.promise;

      attempts = [
        Effect.runPromise(management.inviteMember(input, actor)),
        Effect.runPromise(management.inviteMember(input, actor)),
      ];
      await waitForBlockedAttempts(resource.client, applicationName);
      release.resolve();
      await blockingTransaction;

      await expect(Promise.all(attempts)).resolves.toHaveLength(2);
      const invitations = await resource.client
        .select({ status: schema.invitation.status })
        .from(schema.invitation)
        .where(
          and(
            eq(schema.invitation.organizationId, organizationId),
            eq(schema.invitation.email, recipient),
          ),
        );
      const auditEntries = await resource.client
        .select({ action: schema.auditLog.action })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.organizationId, organizationId),
            eq(schema.auditLog.action, "invitation.created"),
          ),
        );
      const outbox = await resource.client
        .select()
        .from(schema.emailDeliveryOutbox)
        .where(eq(schema.emailDeliveryOutbox.recipient, recipient));
      expect(invitations.map(({ status }) => status).sort()).toEqual([
        "canceled",
        "pending",
      ]);
      expect(auditEntries).toHaveLength(2);
      expect(outbox).toHaveLength(2);
      for (const email of outbox) {
        expect(email.recipient).toBe(recipient);
        expect(email.html).toContain("A &lt;script&gt;alert(1)&lt;/script&gt;");
        expect(email.html).toContain("Studio &amp; Partners");
        expect(email.html).not.toContain("<script>");
      }
    } finally {
      release.resolve();
      await blockingTransaction?.catch(() => undefined);
      await Promise.allSettled(attempts);
      await resource.client
        .delete(schema.emailDeliveryOutbox)
        .where(eq(schema.emailDeliveryOutbox.recipient, recipient));
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.actorId, actorId));
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.client
        .delete(schema.user)
        .where(eq(schema.user.id, actorId));
      await resource.close();
    }
  }, 20_000);

  it("allows one of two concurrent invitation acceptances to claim the row", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const applicationName = `prosewire-invitation-${randomUUID()}`;
    const serviceUrl = withApplicationName(databaseUrl, applicationName);
    const resource = openDb(serviceUrl);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const actorId = UserId.make(`user-${randomUUID()}`);
    const invitationId = InvitationId.make(`invitation-${randomUUID()}`);
    const sessionId = `session-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    let attempts: ReadonlyArray<Promise<string>> = [];
    const locked = deferred();
    const release = deferred();
    let blockingTransaction: Promise<void> | undefined;

    try {
      await resource.client.insert(schema.user).values({
        id: actorId,
        email,
        name: "Invited editor",
      });
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Concurrency test",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.session).values({
        id: sessionId,
        userId: actorId,
        token: `token-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await resource.client.insert(schema.invitation).values({
        id: invitationId,
        organizationId,
        email,
        role: "editor",
        inviterId: actorId,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const management = await workspaceManagement(resource.client, serviceUrl);
      const actor = {
        id: actorId,
        name: "Invited editor",
        email,
        sessionId,
      };
      const input = new InvitationMutationInput({ invitationId });

      blockingTransaction = resource.client.transaction(async (transaction) => {
        await transaction
          .select({ id: schema.invitation.id })
          .from(schema.invitation)
          .where(eq(schema.invitation.id, invitationId))
          .for("update");
        locked.resolve();
        await release.promise;
      });
      await locked.promise;

      const accept = () =>
        Effect.runPromise(
          management.acceptInvitation(input, actor).pipe(
            Effect.match({
              onFailure: (error) => error._tag,
              onSuccess: () => "accepted" as const,
            }),
          ),
        );
      attempts = [accept(), accept()];
      await waitForBlockedAttempts(resource.client, applicationName);
      release.resolve();
      await blockingTransaction;

      const outcomes = await Promise.all(attempts);
      expect([...outcomes].sort()).toEqual(
        ["InvitationNotFound", "accepted"].sort(),
      );

      const acceptedInvitations = await resource.client
        .select({ status: schema.invitation.status })
        .from(schema.invitation)
        .where(eq(schema.invitation.id, invitationId));
      const members = await resource.client
        .select({ userId: schema.member.userId, role: schema.member.role })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, organizationId),
            eq(schema.member.userId, actorId),
          ),
        );
      const auditEntries = await resource.client
        .select({ action: schema.auditLog.action })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.entityId, invitationId),
            eq(schema.auditLog.action, "invitation.accepted"),
          ),
        );
      const sessions = await resource.client
        .select({ activeOrganizationId: schema.session.activeOrganizationId })
        .from(schema.session)
        .where(eq(schema.session.id, sessionId));

      expect(acceptedInvitations).toEqual([{ status: "accepted" }]);
      expect(members).toEqual([{ userId: actorId, role: "editor" }]);
      expect(auditEntries).toEqual([{ action: "invitation.accepted" }]);
      expect(sessions).toEqual([{ activeOrganizationId: organizationId }]);
    } finally {
      release.resolve();
      await blockingTransaction?.catch(() => undefined);
      await Promise.allSettled(attempts);
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.actorId, actorId));
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.client
        .delete(schema.user)
        .where(eq(schema.user.id, actorId));
      await resource.close();
    }
  }, 20_000);

  it("preserves publication time and records the prior row before editing", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const actorId = UserId.make(`user-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const authorId = AuthorId.make(randomUUID());
    const postId = PostId.make(randomUUID());
    const publishedAt = new Date("2026-08-01T09:00:00.000Z");

    try {
      await resource.client.insert(schema.user).values({
        id: actorId,
        email: `${randomUUID()}@example.com`,
        name: "Publishing editor",
      });
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Publishing test",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values({
        id: `member-${randomUUID()}`,
        organizationId,
        userId: actorId,
        role: "owner",
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "Fieldnotes",
        slug: `blog-${randomUUID()}`,
      });
      await resource.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "Publishing editor",
        slug: `author-${randomUUID()}`,
        userId: actorId,
      });
      await resource.client.insert(schema.post).values({
        id: postId,
        blogId,
        authorId,
        title: "Published post",
        slug: "published-post",
        contentMarkdown: "# Original",
        contentHtml: "<h1>Original</h1>",
        status: "published",
        publishedAt,
        createdById: actorId,
        updatedById: actorId,
      });

      const service = await publishing(resource.client);
      await Effect.runPromise(
        service.updatePost(
          new UpdatePostCommand({
            postId,
            blogId,
            authorId,
            categoryIds: [],
            title: "Published post, edited",
            slug: "published-post",
            excerpt: "Edited",
            contentMarkdown: "# Edited",
            status: "published",
            featured: false,
            locale: "en",
            coverImageUrl: null,
            coverImageAlt: null,
            seoTitle: null,
            seoDescription: null,
            focusKeyword: null,
            canonicalUrl: null,
            scheduledAt: null,
          }),
          { _tag: "Dashboard", userId: actorId },
        ),
      );

      const posts = await resource.client
        .select({
          title: schema.post.title,
          publishedAt: schema.post.publishedAt,
        })
        .from(schema.post)
        .where(eq(schema.post.id, postId));
      const revisions = await resource.client
        .select({
          version: schema.postRevision.version,
          snapshot: schema.postRevision.snapshot,
        })
        .from(schema.postRevision)
        .where(eq(schema.postRevision.postId, postId));

      expect(posts).toEqual([{ title: "Published post, edited", publishedAt }]);
      expect(revisions).toHaveLength(1);
      expect(revisions[0]).toMatchObject({
        version: 1,
        snapshot: { title: "Published post", slug: "published-post" },
      });
    } finally {
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.actorId, actorId));
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.client
        .delete(schema.user)
        .where(eq(schema.user.id, actorId));
      await resource.close();
    }
  });

  it("rejects lost and unauthorized invitation cancellation claims without writes", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const actorId = UserId.make(`user-${randomUUID()}`);
    const ownedOrganizationId = OrganizationId.make(
      `workspace-${randomUUID()}`,
    );
    const otherOrganizationId = OrganizationId.make(
      `workspace-${randomUUID()}`,
    );
    const acceptedInvitationId = InvitationId.make(
      `invitation-${randomUUID()}`,
    );
    const unauthorizedInvitationId = InvitationId.make(
      `invitation-${randomUUID()}`,
    );

    try {
      await resource.client.insert(schema.user).values({
        id: actorId,
        email: `${randomUUID()}@example.com`,
        name: "Workspace owner",
      });
      await resource.client.insert(schema.organization).values([
        {
          id: ownedOrganizationId,
          name: "Owned workspace",
          slug: `workspace-${randomUUID()}`,
        },
        {
          id: otherOrganizationId,
          name: "Other workspace",
          slug: `workspace-${randomUUID()}`,
        },
      ]);
      await resource.client.insert(schema.member).values({
        id: `member-${randomUUID()}`,
        organizationId: ownedOrganizationId,
        userId: actorId,
        role: "owner",
      });
      await resource.client.insert(schema.invitation).values([
        {
          id: acceptedInvitationId,
          organizationId: ownedOrganizationId,
          email: `${randomUUID()}@example.com`,
          role: "viewer",
          status: "accepted",
          inviterId: actorId,
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          id: unauthorizedInvitationId,
          organizationId: otherOrganizationId,
          email: `${randomUUID()}@example.com`,
          role: "viewer",
          inviterId: actorId,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      const management = await workspaceManagement(
        resource.client,
        databaseUrl,
      );
      const actor = {
        id: actorId,
        name: "Workspace owner",
        email: `${randomUUID()}@example.com`,
        sessionId: `session-${randomUUID()}`,
      };
      const lostClaim = await Effect.runPromise(
        Effect.flip(
          management.cancelInvitation(
            ownedOrganizationId,
            new InvitationMutationInput({
              invitationId: acceptedInvitationId,
            }),
            actor,
          ),
        ),
      );
      const unauthorized = await Effect.runPromise(
        Effect.flip(
          management.cancelInvitation(
            otherOrganizationId,
            new InvitationMutationInput({
              invitationId: unauthorizedInvitationId,
            }),
            actor,
          ),
        ),
      );

      expect(lostClaim).toBeInstanceOf(WorkspaceManagement.InvitationNotFound);
      expect(unauthorized).toBeInstanceOf(BlogAccess.WorkspaceAccessDenied);
      const invitations = await resource.client
        .select({ id: schema.invitation.id, status: schema.invitation.status })
        .from(schema.invitation)
        .where(
          inArray(schema.invitation.id, [
            acceptedInvitationId,
            unauthorizedInvitationId,
          ]),
        );
      const audits = await resource.client
        .select({ id: schema.auditLog.id })
        .from(schema.auditLog)
        .where(
          inArray(schema.auditLog.entityId, [
            acceptedInvitationId,
            unauthorizedInvitationId,
          ]),
        );

      expect(
        invitations
          .map(({ id, status }) => ({ id, status }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ).toEqual(
        [
          { id: acceptedInvitationId, status: "accepted" },
          { id: unauthorizedInvitationId, status: "pending" },
        ].sort((left, right) => left.id.localeCompare(right.id)),
      );
      expect(audits).toEqual([]);
    } finally {
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.actorId, actorId));
      await resource.client
        .delete(schema.organization)
        .where(
          inArray(schema.organization.id, [
            ownedOrganizationId,
            otherOrganizationId,
          ]),
        );
      await resource.client
        .delete(schema.user)
        .where(eq(schema.user.id, actorId));
      await resource.close();
    }
  });

  it("evaluates publication authorization through the real membership joins", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const viewerId = UserId.make(`user-${randomUUID()}`);
    const outsiderId = UserId.make(`user-${randomUUID()}`);
    const validOrganizationId = OrganizationId.make(
      `workspace-${randomUUID()}`,
    );
    const invalidOrganizationId = OrganizationId.make(
      `workspace-${randomUUID()}`,
    );
    const validBlogId = BlogId.make(randomUUID());
    const invalidBlogId = BlogId.make(randomUUID());

    try {
      await resource.client.insert(schema.user).values([
        {
          id: viewerId,
          email: `${randomUUID()}@example.com`,
          name: "Viewer",
        },
        {
          id: outsiderId,
          email: `${randomUUID()}@example.com`,
          name: "Outsider",
        },
      ]);
      await resource.client.insert(schema.organization).values([
        {
          id: validOrganizationId,
          name: "Valid workspace",
          slug: `workspace-${randomUUID()}`,
        },
        {
          id: invalidOrganizationId,
          name: "Invalid workspace",
          slug: `workspace-${randomUUID()}`,
        },
      ]);
      await resource.client.insert(schema.member).values([
        {
          id: `member-${randomUUID()}`,
          organizationId: validOrganizationId,
          userId: viewerId,
          role: "viewer",
        },
        {
          id: `member-${randomUUID()}`,
          organizationId: invalidOrganizationId,
          userId: viewerId,
          role: "viewer",
        },
      ]);
      await resource.client.insert(schema.blog).values([
        {
          id: validBlogId,
          organizationId: validOrganizationId,
          name: "Fieldnotes",
          slug: `blog-${randomUUID()}`,
        },
        {
          id: invalidBlogId,
          organizationId: invalidOrganizationId,
          name: "Invalid",
          slug: "Invalid Slug",
        },
      ]);

      const access = await blogAccess(resource.client);
      const read = await Effect.runPromise(
        access.requireRead(validBlogId, viewerId),
      );
      const createDenied = await Effect.runPromise(
        Effect.flip(access.requirePostCreate(validBlogId, viewerId)),
      );
      const outsiderDenied = await Effect.runPromise(
        Effect.flip(access.requireRead(validBlogId, outsiderId)),
      );
      const decodeFailure = await Effect.runPromise(
        Effect.flip(access.findBlog(invalidBlogId, viewerId)),
      );

      expect(read.role).toBe("viewer");
      expect(createDenied).toMatchObject({
        _tag: "BlogAccessDenied",
        capability: "content:create",
      });
      expect(outsiderDenied).toMatchObject({
        _tag: "BlogAccessDenied",
        capability: "content:read",
      });
      expect(decodeFailure).toBeInstanceOf(BlogAccess.PersistenceError);
      expect(decodeFailure.operation).toBe("publication.decodeAuthorized");
    } finally {
      await resource.client
        .delete(schema.organization)
        .where(
          inArray(schema.organization.id, [
            validOrganizationId,
            invalidOrganizationId,
          ]),
        );
      await resource.client
        .delete(schema.user)
        .where(inArray(schema.user.id, [viewerId, outsiderId]));
      await resource.close();
    }
  });

  it("authenticates API keys without mutating their persisted state", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const keyId = ApiKeyId.make(randomUUID());
    const token = `pw_${randomUUID()}`;

    try {
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "API workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "API publication",
        slug: `blog-${randomUUID()}`,
      });
      await resource.client.insert(schema.apiKey).values({
        id: keyId,
        blogId,
        name: "Read only",
        prefix: token.slice(0, 10),
        keyHash: createHash("sha256").update(token).digest("hex"),
        scopes: ["content:read"],
      });

      const access = await apiAccess(resource.client);
      const principal = await Effect.runPromise(
        access.authenticate(token, "content:read"),
      );
      const denied = await Effect.runPromise(
        Effect.flip(access.authenticate(token, "content:write")),
      );
      const persisted = await resource.client.query.apiKey.findFirst({
        where: eq(schema.apiKey.id, keyId),
      });

      expect(principal).toMatchObject({ blogId, keyId });
      expect(denied).toMatchObject({
        _tag: "ApiScopeDenied",
        requiredScope: "content:write",
      });
      expect(persisted?.lastUsedAt).toBeNull();
    } finally {
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.close();
    }
  });

  it("requires a matching pending invitation for gated registration", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const inviterId = UserId.make(`user-${randomUUID()}`);
    const pendingId = `invitation-${randomUUID()}`;
    const canceledId = `invitation-${randomUUID()}`;
    const expiredId = `invitation-${randomUUID()}`;
    const email = `${randomUUID()}@example.com`;
    const expiredEmail = `${randomUUID()}@example.com`;
    const now = new Date("2030-01-01T12:00:00.000Z");

    try {
      await resource.client.insert(schema.user).values({
        id: inviterId,
        email: `${randomUUID()}@example.com`,
        name: "Inviter",
      });
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Registration workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.invitation).values([
        {
          id: pendingId,
          organizationId,
          email,
          role: "viewer",
          inviterId,
          expiresAt: new Date("2031-01-01T00:00:00.000Z"),
        },
        {
          id: canceledId,
          organizationId,
          email,
          role: "viewer",
          status: "canceled",
          inviterId,
          expiresAt: new Date("2031-01-01T00:00:00.000Z"),
        },
        {
          id: expiredId,
          organizationId,
          email: expiredEmail,
          role: "viewer",
          inviterId,
          expiresAt: new Date("2029-01-01T00:00:00.000Z"),
        },
      ]);

      const invitations = makeRegistrationInvitationLookup(resource.client);
      await expect(
        requireRegistrationInvitation(invitations, {
          allowSignUp: true,
          email,
          invitationId: null,
          now,
        }),
      ).resolves.toBeUndefined();
      await expect(
        requireRegistrationInvitation(invitations, {
          allowSignUp: false,
          email,
          invitationId: null,
          now,
        }),
      ).rejects.toThrow("Registration requires a workspace invitation");
      for (const [invitationId, attemptedEmail] of [
        [`missing-${randomUUID()}`, email],
        [canceledId, email],
        [expiredId, expiredEmail],
      ] as const) {
        await expect(
          requireRegistrationInvitation(invitations, {
            allowSignUp: false,
            email: attemptedEmail,
            invitationId,
            now,
          }),
        ).rejects.toThrow("Registration requires a workspace invitation");
      }
      await expect(
        requireRegistrationInvitation(invitations, {
          allowSignUp: false,
          email: email.toUpperCase(),
          invitationId: pendingId,
          now,
        }),
      ).resolves.toBeUndefined();
    } finally {
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.client
        .delete(schema.user)
        .where(eq(schema.user.id, inviterId));
      await resource.close();
    }
  });

  it("denies an author from taking a published post back to draft without writes", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const actorId = UserId.make(`user-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const authorId = AuthorId.make(randomUUID());
    const postId = PostId.make(randomUUID());

    try {
      await resource.client.insert(schema.user).values({
        id: actorId,
        email: `${randomUUID()}@example.com`,
        name: "Author",
      });
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Author workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values({
        id: `member-${randomUUID()}`,
        organizationId,
        userId: actorId,
        role: "author",
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "Author publication",
        slug: `blog-${randomUUID()}`,
      });
      await resource.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "Author",
        slug: `author-${randomUUID()}`,
        userId: actorId,
      });
      await resource.client.insert(schema.post).values({
        id: postId,
        blogId,
        authorId,
        title: "Published post",
        slug: "published-post",
        contentMarkdown: "# Published",
        contentHtml: "<h1>Published</h1>",
        status: "published",
        publishedAt: new Date("2029-01-01T00:00:00.000Z"),
        createdById: actorId,
        updatedById: actorId,
      });

      const service = await publishing(resource.client);
      const denied = await Effect.runPromise(
        Effect.flip(
          service.updatePost(
            new UpdatePostCommand({
              postId,
              blogId,
              authorId,
              categoryIds: [],
              title: "Back to draft",
              slug: "back-to-draft",
              excerpt: "",
              contentMarkdown: "# Draft",
              status: "draft",
              featured: false,
              locale: "en",
              coverImageUrl: null,
              coverImageAlt: null,
              seoTitle: null,
              seoDescription: null,
              focusKeyword: null,
              canonicalUrl: null,
              scheduledAt: null,
            }),
            { _tag: "Dashboard", userId: actorId },
          ),
        ),
      );
      const persisted = await resource.client.query.post.findFirst({
        where: eq(schema.post.id, postId),
      });
      const revisions = await resource.client.query.postRevision.findMany({
        where: eq(schema.postRevision.postId, postId),
      });
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.entityId, postId),
      });

      expect(denied).toMatchObject({
        _tag: "BlogAccessDenied",
        capability: "content:publish",
      });
      expect(persisted).toMatchObject({
        title: "Published post",
        slug: "published-post",
        status: "published",
      });
      expect(revisions).toEqual([]);
      expect(audits).toEqual([]);
    } finally {
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.actorId, actorId));
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.client
        .delete(schema.user)
        .where(eq(schema.user.id, actorId));
      await resource.close();
    }
  });

  it("archives through an active API key and rejects a revoked key without writes", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const authorId = AuthorId.make(randomUUID());
    const archivedPostId = PostId.make(randomUUID());
    const untouchedPostId = PostId.make(randomUUID());
    const keyId = ApiKeyId.make(randomUUID());
    const revokedKeyId = ApiKeyId.make(randomUUID());

    try {
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "API archive workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "API archive publication",
        slug: `blog-${randomUUID()}`,
      });
      await resource.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "API author",
        slug: `author-${randomUUID()}`,
      });
      await resource.client.insert(schema.post).values([
        {
          id: archivedPostId,
          blogId,
          authorId,
          title: "Archive me",
          slug: "archive-me",
          status: "published",
          publishedAt: new Date("2029-01-01T00:00:00.000Z"),
        },
        {
          id: untouchedPostId,
          blogId,
          authorId,
          title: "Leave me",
          slug: "leave-me",
          status: "published",
          publishedAt: new Date("2029-01-01T00:00:00.000Z"),
        },
      ]);
      await resource.client.insert(schema.postRevision).values(
        [1, 2, 3].map((version) => ({
          postId: archivedPostId,
          version,
          snapshot: { version },
        })),
      );
      await resource.client.insert(schema.apiKey).values({
        id: keyId,
        blogId,
        name: "Writer",
        prefix: `pw_${randomUUID()}`.slice(0, 10),
        keyHash: randomUUID().replaceAll("-", ""),
        scopes: ["content:read", "content:write"],
      });

      const service = await publishing(resource.client);
      const result = await Effect.runPromise(
        service.archivePosts(
          new ArchivePostsCommand({
            blogId,
            postIds: [archivedPostId],
            requireAll: true,
          }),
          { _tag: "Api", keyId },
        ),
      );
      const revoked = await Effect.runPromise(
        Effect.flip(
          service.archivePosts(
            new ArchivePostsCommand({
              blogId,
              postIds: [untouchedPostId],
              requireAll: true,
            }),
            { _tag: "Api", keyId: revokedKeyId },
          ),
        ),
      );
      const posts = await resource.client
        .select({
          id: schema.post.id,
          status: schema.post.status,
          archivedAt: schema.post.archivedAt,
        })
        .from(schema.post)
        .where(inArray(schema.post.id, [archivedPostId, untouchedPostId]));
      const revisions = await resource.client.query.postRevision.findMany({
        where: inArray(schema.postRevision.postId, [
          archivedPostId,
          untouchedPostId,
        ]),
      });
      const audits = await resource.client.query.auditLog.findMany({
        where: inArray(schema.auditLog.entityId, [
          archivedPostId,
          untouchedPostId,
        ]),
      });
      const byId = new Map(posts.map((post) => [post.id, post]));

      expect(result).toEqual({ ok: true });
      expect(revoked).toBeInstanceOf(ApiAccess.AuthenticationFailed);
      expect(byId.get(archivedPostId)?.status).toBe("archived");
      expect(byId.get(archivedPostId)?.archivedAt).toBeInstanceOf(Date);
      expect(byId.get(untouchedPostId)).toMatchObject({
        status: "published",
        archivedAt: null,
      });
      expect(
        revisions
          .filter((revision) => revision.postId === archivedPostId)
          .map(({ version }) => version)
          .sort(),
      ).toEqual([1, 2, 3, 4]);
      expect(
        revisions.filter((revision) => revision.postId === untouchedPostId),
      ).toEqual([]);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: "post.archived",
        entityId: archivedPostId,
      });
    } finally {
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.blogId, blogId));
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.close();
    }
  });
});
