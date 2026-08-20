import { Buffer } from "node:buffer";
import { and, eq, gt } from "drizzle-orm";
import { Clock, Context, Crypto, Effect, Layer, Schema } from "effect";
import {
  isTeamRole,
  slugify,
  type TeamRole as CoreTeamRole,
} from "@prosewire/core";
import * as schema from "@prosewire/db/schema";
import { BlogAccess } from "./authorization.ts";
import {
  Workspace,
  WorkspaceInvitation,
  toWorkspace,
} from "./content-models.ts";
import { WebConfig } from "./config.ts";
import { Database, type DatabaseError } from "./database.ts";
import {
  ApiKeyId,
  BlogId,
  InvitationId,
  MemberId,
  OrganizationId,
  UserId,
} from "./domain.ts";
import { TransactionalEmail } from "./transactional-email.ts";

const EditableRole = Schema.Literals(["admin", "editor", "author", "viewer"]);
type EditableRole = typeof EditableRole.Type;

export class InvalidWorkspaceInput extends Schema.TaggedError<InvalidWorkspaceInput>()(
  "InvalidWorkspaceInput",
  { message: Schema.String },
) {}

export class InvitationNotFound extends Schema.TaggedError<InvitationNotFound>()(
  "InvitationNotFound",
  { invitationId: InvitationId },
) {}

export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "MemberNotFound",
  { memberId: MemberId },
) {}

export class ApiKeyNotFound extends Schema.TaggedError<ApiKeyNotFound>()(
  "ApiKeyNotFound",
  { apiKeyId: ApiKeyId },
) {}

export class ProtectedMember extends Schema.TaggedError<ProtectedMember>()(
  "ProtectedMember",
  { message: Schema.String },
) {}

export class CreateWorkspaceInput extends Schema.Class<CreateWorkspaceInput>(
  "WorkspaceManagement.CreateWorkspaceInput",
)({
  workspaceName: Schema.String,
  workspaceSlug: Schema.String,
  publicationName: Schema.String,
  publicationSlug: Schema.String,
}) {}

export class CreatePublicationInput extends Schema.Class<CreatePublicationInput>(
  "WorkspaceManagement.CreatePublicationInput",
)({
  organizationId: OrganizationId,
  name: Schema.String,
  slug: Schema.String,
}) {}

export class UpdateWorkspaceInput extends Schema.Class<UpdateWorkspaceInput>(
  "WorkspaceManagement.UpdateWorkspaceInput",
)({
  organizationId: OrganizationId,
  name: Schema.String,
}) {}

export class InviteMemberInput extends Schema.Class<InviteMemberInput>(
  "WorkspaceManagement.InviteMemberInput",
)({
  organizationId: OrganizationId,
  email: Schema.String,
  role: EditableRole,
}) {}

export class UpdateMemberRoleInput extends Schema.Class<UpdateMemberRoleInput>(
  "WorkspaceManagement.UpdateMemberRoleInput",
)({
  organizationId: OrganizationId,
  memberId: MemberId,
  role: EditableRole,
}) {}

export class MemberMutationInput extends Schema.Class<MemberMutationInput>(
  "WorkspaceManagement.MemberMutationInput",
)({
  organizationId: OrganizationId,
  memberId: MemberId,
}) {}

export class InvitationMutationInput extends Schema.Class<InvitationMutationInput>(
  "WorkspaceManagement.InvitationMutationInput",
)({
  invitationId: InvitationId,
}) {}

export class CreateApiKeyInput extends Schema.Class<CreateApiKeyInput>(
  "WorkspaceManagement.CreateApiKeyInput",
)({
  blogId: BlogId,
  name: Schema.String,
  allowWrite: Schema.Boolean,
}) {}

export class RevokeApiKeyInput extends Schema.Class<RevokeApiKeyInput>(
  "WorkspaceManagement.RevokeApiKeyInput",
)({
  blogId: BlogId,
  apiKeyId: ApiKeyId,
}) {}

export class InvitationDetails extends Schema.Class<InvitationDetails>(
  "WorkspaceManagement.InvitationDetails",
)({
  invitation: WorkspaceInvitation,
  workspace: Workspace,
}) {}

export interface Actor {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly sessionId: string;
}

export type Error =
  | DatabaseError
  | BlogAccess.Error
  | TransactionalEmail.EmailDeliveryError
  | InvalidWorkspaceInput
  | InvitationNotFound
  | MemberNotFound
  | ApiKeyNotFound
  | ProtectedMember;

function required(
  value: string,
  label: string,
): Effect.Effect<string, InvalidWorkspaceInput> {
  const normalized = value.trim();
  return normalized
    ? Effect.succeed(normalized)
    : Effect.fail(
        new InvalidWorkspaceInput({ message: `${label} is required` }),
      );
}

function requiredSlug(
  value: string,
  fallback: string,
  label: string,
): Effect.Effect<string, InvalidWorkspaceInput> {
  const normalized = slugify(value.trim() || fallback.trim());
  return normalized
    ? Effect.succeed(normalized)
    : Effect.fail(
        new InvalidWorkspaceInput({ message: `${label} is required` }),
      );
}

function normalizeRole(role: string): CoreTeamRole | undefined {
  if (role === "member") return "viewer";
  return isTeamRole(role) ? role : undefined;
}

function toInvitation(
  row: typeof schema.invitation.$inferSelect,
): WorkspaceInvitation | undefined {
  const role = normalizeRole(row.role);
  if (!role) return undefined;
  return new WorkspaceInvitation({
    ...row,
    id: InvitationId.make(row.id),
    organizationId: OrganizationId.make(row.organizationId),
    inviterId: UserId.make(row.inviterId),
    role,
  });
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const create = Effect.fn("WorkspaceManagement.create")(function* () {
  const database = yield* Database;
  const access = yield* BlogAccess.Service;
  const email = yield* TransactionalEmail.Service;
  const crypto = yield* Crypto.Crypto;
  const config = yield* WebConfig;

  const uuid = crypto.randomUUIDv4.pipe(Effect.orDie);

  const invitationDetails = Effect.fn("WorkspaceManagement.invitationDetails")(
    function* (invitationId: InvitationId, emailAddress?: string) {
      const now = new Date(yield* Clock.currentTimeMillis);
      const rows = yield* database.execute("invitation.getDetails", (client) =>
        client
          .select({
            invitation: schema.invitation,
            workspace: schema.organization,
          })
          .from(schema.invitation)
          .innerJoin(
            schema.organization,
            eq(schema.invitation.organizationId, schema.organization.id),
          )
          .where(
            and(
              eq(schema.invitation.id, invitationId),
              eq(schema.invitation.status, "pending"),
              gt(schema.invitation.expiresAt, now),
              ...(emailAddress
                ? [eq(schema.invitation.email, emailAddress.toLowerCase())]
                : []),
            ),
          ),
      );
      const row = rows[0];
      const invitation = row ? toInvitation(row.invitation) : undefined;
      return row && invitation
        ? new InvitationDetails({
            invitation,
            workspace: toWorkspace(row.workspace),
          })
        : undefined;
    },
  );

  const createWorkspace = Effect.fn("WorkspaceManagement.createWorkspace")(
    function* (input: CreateWorkspaceInput, actor: Actor) {
      const workspaceName = yield* required(input.workspaceName, "Workspace name");
      const publicationName = yield* required(
        input.publicationName,
        "Publication name",
      );
      const workspaceSlug = yield* requiredSlug(
        input.workspaceSlug,
        workspaceName,
        "Workspace slug",
      );
      const publicationSlug = yield* requiredSlug(
        input.publicationSlug,
        publicationName,
        "Publication slug",
      );
      const organizationId = OrganizationId.make(yield* uuid);
      const memberId = MemberId.make(yield* uuid);
      const authorSlug = yield* requiredSlug(
        actor.name,
        actor.email,
        "Author name",
      );
      const now = new Date(yield* Clock.currentTimeMillis);
      const publication = yield* database.execute(
        "workspace.create",
        (client) =>
          client.transaction(async (tx) => {
            await tx.insert(schema.organization).values({
              id: organizationId,
              name: workspaceName,
              slug: workspaceSlug,
            });
            await tx.insert(schema.member).values({
              id: memberId,
              organizationId,
              userId: actor.id,
              role: "owner",
            });
            const [created] = await tx
              .insert(schema.blog)
              .values({
                organizationId,
                name: publicationName,
                slug: publicationSlug,
              })
              .returning();
            if (!created) throw new Error("Unable to create publication");
            await tx.insert(schema.author).values({
              blogId: created.id,
              userId: actor.id,
              name: actor.name,
              slug: authorSlug,
            });
            await tx
              .update(schema.session)
              .set({ activeOrganizationId: organizationId, updatedAt: now })
              .where(eq(schema.session.id, actor.sessionId));
            await tx.insert(schema.auditLog).values([
              {
                organizationId,
                actorId: actor.id,
                action: "workspace.created",
                entityType: "workspace",
                entityId: organizationId,
                after: { name: workspaceName, slug: workspaceSlug },
              },
              {
                organizationId,
                blogId: created.id,
                actorId: actor.id,
                action: "publication.created",
                entityType: "publication",
                entityId: created.id,
                after: { name: publicationName, slug: publicationSlug },
              },
            ]);
            return created;
          }),
      );
      return {
        organizationId,
        blogId: BlogId.make(publication.id),
      };
    },
  );

  const createPublication = Effect.fn(
    "WorkspaceManagement.createPublication",
  )(function* (input: CreatePublicationInput, actor: Actor) {
    const authorization = yield* access.requirePublicationCreate(
      input.organizationId,
      actor.id,
    );
    const name = yield* required(input.name, "Publication name");
    const slug = yield* requiredSlug(input.slug, name, "Publication slug");
    const authorSlug = yield* requiredSlug(
      actor.name,
      actor.email,
      "Author name",
    );
    const created = yield* database.execute("publication.create", (client) =>
      client.transaction(async (tx) => {
        const [publication] = await tx
          .insert(schema.blog)
          .values({ organizationId: input.organizationId, name, slug })
          .returning();
        if (!publication) throw new Error("Unable to create publication");
        await tx.insert(schema.author).values({
          blogId: publication.id,
          userId: actor.id,
          name: actor.name,
          slug: authorSlug,
        });
        await tx.insert(schema.auditLog).values({
          organizationId: authorization.workspace.id,
          blogId: publication.id,
          actorId: actor.id,
          action: "publication.created",
          entityType: "publication",
          entityId: publication.id,
          after: { name, slug },
        });
        return publication;
      }),
    );
    return BlogId.make(created.id);
  });

  const updateWorkspace = Effect.fn("WorkspaceManagement.updateWorkspace")(
    function* (input: UpdateWorkspaceInput, actor: Actor) {
      const authorization = yield* access.requireWorkspaceUpdate(
        input.organizationId,
        actor.id,
      );
      const name = yield* required(input.name, "Workspace name");
      yield* database.execute("workspace.update", (client) =>
        client.transaction(async (tx) => {
          await tx
            .update(schema.organization)
            .set({ name })
            .where(eq(schema.organization.id, input.organizationId));
          await tx.insert(schema.auditLog).values({
            organizationId: input.organizationId,
            actorId: actor.id,
            action: "workspace.updated",
            entityType: "workspace",
            entityId: input.organizationId,
            before: { name: authorization.workspace.name },
            after: { name },
          });
        }),
      );
    },
  );

  const switchWorkspace = Effect.fn("WorkspaceManagement.switchWorkspace")(
    function* (organizationId: OrganizationId, actor: Actor) {
      const authorization = yield* access.findWorkspace(
        organizationId,
        actor.id,
      );
      if (!authorization) {
        return yield* new BlogAccess.WorkspaceAccessDenied({
          organizationId,
          userId: actor.id,
          capability: "content:read",
        });
      }
      const now = new Date(yield* Clock.currentTimeMillis);
      const publication = yield* database.execute(
        "workspace.switch",
        (client) =>
          client.transaction(async (tx) => {
            await tx
              .update(schema.session)
              .set({ activeOrganizationId: organizationId, updatedAt: now })
              .where(eq(schema.session.id, actor.sessionId));
            return tx.query.blog.findFirst({
              where: eq(schema.blog.organizationId, organizationId),
            });
          }),
      );
      return publication ? BlogId.make(publication.id) : undefined;
    },
  );

  const switchPublication = Effect.fn(
    "WorkspaceManagement.switchPublication",
  )(function* (blogId: BlogId, actor: Actor) {
    const authorization = yield* access.requireRead(blogId, actor.id);
    const now = new Date(yield* Clock.currentTimeMillis);
    yield* database.execute("publication.switch", (client) =>
      client
        .update(schema.session)
        .set({
          activeOrganizationId: authorization.workspace.id,
          updatedAt: now,
        })
        .where(eq(schema.session.id, actor.sessionId)),
    );
    return authorization;
  });

  const inviteMember = Effect.fn("WorkspaceManagement.inviteMember")(
    function* (input: InviteMemberInput, actor: Actor) {
      const authorization = yield* access.requireMembersManage(
        input.organizationId,
        actor.id,
      );
      const recipient = input.email.trim().toLowerCase();
      if (!recipient || !recipient.includes("@")) {
        return yield* new InvalidWorkspaceInput({
          message: "Enter a valid email address",
        });
      }
      const existingUser = yield* database.execute(
        "invitation.findExistingMember",
        (client) =>
          client
            .select({ id: schema.member.id })
            .from(schema.member)
            .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
            .where(
              and(
                eq(schema.member.organizationId, input.organizationId),
                eq(schema.user.email, recipient),
              ),
            ),
      );
      if (existingUser[0]) {
        return yield* new InvalidWorkspaceInput({
          message: "That person is already a workspace member",
        });
      }
      const invitationId = InvitationId.make(yield* uuid);
      const now = new Date(yield* Clock.currentTimeMillis);
      const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      yield* database.execute("invitation.create", (client) =>
        client.transaction(async (tx) => {
          await tx
            .update(schema.invitation)
            .set({ status: "canceled" })
            .where(
              and(
                eq(schema.invitation.organizationId, input.organizationId),
                eq(schema.invitation.email, recipient),
                eq(schema.invitation.status, "pending"),
              ),
            );
          await tx.insert(schema.invitation).values({
            id: invitationId,
            organizationId: input.organizationId,
            email: recipient,
            role: input.role,
            inviterId: actor.id,
            expiresAt,
          });
          await tx.insert(schema.auditLog).values({
            organizationId: input.organizationId,
            actorId: actor.id,
            action: "invitation.created",
            entityType: "invitation",
            entityId: invitationId,
            after: { email: recipient, role: input.role },
          });
        }),
      );
      const invitationUrl = `${config.publicUrl}/accept-invitation/${invitationId}`;
      yield* email.send(
        new TransactionalEmail.Message({
          to: recipient,
          subject: `Join ${authorization.workspace.name} on Prosewire`,
          text: `${actor.name} invited you to join ${authorization.workspace.name} as ${input.role}. Accept the invitation: ${invitationUrl}`,
          html: `<p>${actor.name} invited you to join <strong>${authorization.workspace.name}</strong> as ${input.role}.</p><p><a href="${invitationUrl}">Accept invitation</a></p>`,
        }),
      );
      return invitationId;
    },
  );

  const updateMemberRole = Effect.fn(
    "WorkspaceManagement.updateMemberRole",
  )(function* (input: UpdateMemberRoleInput, actor: Actor) {
    yield* access.requireMembersManage(input.organizationId, actor.id);
    const target = yield* database.execute("member.findForRoleUpdate", (client) =>
      client.query.member.findFirst({
        where: and(
          eq(schema.member.id, input.memberId),
          eq(schema.member.organizationId, input.organizationId),
        ),
      }),
    );
    if (!target) return yield* new MemberNotFound({ memberId: input.memberId });
    if (target.role === "owner" || target.userId === actor.id) {
      return yield* new ProtectedMember({
        message: "The owner role and your own membership cannot be changed here",
      });
    }
    yield* database.execute("member.updateRole", (client) =>
      client.transaction(async (tx) => {
        await tx
          .update(schema.member)
          .set({ role: input.role })
          .where(
            and(
              eq(schema.member.id, input.memberId),
              eq(schema.member.organizationId, input.organizationId),
            ),
          );
        await tx.insert(schema.auditLog).values({
          organizationId: input.organizationId,
          actorId: actor.id,
          action: "member.role_updated",
          entityType: "member",
          entityId: input.memberId,
          before: { role: target.role },
          after: { role: input.role, userId: target.userId },
        });
      }),
    );
  });

  const removeMember = Effect.fn("WorkspaceManagement.removeMember")(
    function* (input: MemberMutationInput, actor: Actor) {
      yield* access.requireMembersManage(input.organizationId, actor.id);
      const target = yield* database.execute("member.findForRemoval", (client) =>
        client.query.member.findFirst({
          where: and(
            eq(schema.member.id, input.memberId),
            eq(schema.member.organizationId, input.organizationId),
          ),
        }),
      );
      if (!target) return yield* new MemberNotFound({ memberId: input.memberId });
      if (target.role === "owner" || target.userId === actor.id) {
        return yield* new ProtectedMember({
          message: "The owner and your own membership cannot be removed here",
        });
      }
      yield* database.execute("member.remove", (client) =>
        client.transaction(async (tx) => {
          await tx
            .delete(schema.member)
            .where(
              and(
                eq(schema.member.id, input.memberId),
                eq(schema.member.organizationId, input.organizationId),
              ),
            );
          await tx.insert(schema.auditLog).values({
            organizationId: input.organizationId,
            actorId: actor.id,
            action: "member.removed",
            entityType: "member",
            entityId: input.memberId,
            before: { role: target.role, userId: target.userId },
          });
        }),
      );
    },
  );

  const cancelInvitation = Effect.fn(
    "WorkspaceManagement.cancelInvitation",
  )(function* (
    organizationId: OrganizationId,
    input: InvitationMutationInput,
    actor: Actor,
  ) {
    yield* access.requireMembersManage(organizationId, actor.id);
    const invitation = yield* database.execute(
      "invitation.findForCancellation",
      (client) =>
        client.query.invitation.findFirst({
          where: and(
            eq(schema.invitation.id, input.invitationId),
            eq(schema.invitation.organizationId, organizationId),
            eq(schema.invitation.status, "pending"),
          ),
        }),
    );
    if (!invitation) {
      return yield* new InvitationNotFound({
        invitationId: input.invitationId,
      });
    }
    yield* database.execute("invitation.cancel", (client) =>
      client.transaction(async (tx) => {
        await tx
          .update(schema.invitation)
          .set({ status: "canceled" })
          .where(eq(schema.invitation.id, input.invitationId));
        await tx.insert(schema.auditLog).values({
          organizationId,
          actorId: actor.id,
          action: "invitation.canceled",
          entityType: "invitation",
          entityId: input.invitationId,
          before: { email: invitation.email, role: invitation.role },
        });
      }),
    );
  });

  const acceptInvitation = Effect.fn(
    "WorkspaceManagement.acceptInvitation",
  )(function* (input: InvitationMutationInput, actor: Actor) {
    const details = yield* invitationDetails(input.invitationId, actor.email);
    if (!details) {
      return yield* new InvitationNotFound({
        invitationId: input.invitationId,
      });
    }
    const memberId = MemberId.make(yield* uuid);
    const now = new Date(yield* Clock.currentTimeMillis);
    yield* database.execute("invitation.accept", (client) =>
      client.transaction(async (tx) => {
        await tx
          .insert(schema.member)
          .values({
            id: memberId,
            organizationId: details.workspace.id,
            userId: actor.id,
            role: details.invitation.role,
          })
          .onConflictDoNothing({
            target: [schema.member.organizationId, schema.member.userId],
          });
        await tx
          .update(schema.invitation)
          .set({ status: "accepted" })
          .where(
            and(
              eq(schema.invitation.id, input.invitationId),
              eq(schema.invitation.status, "pending"),
            ),
          );
        await tx
          .update(schema.session)
          .set({
            activeOrganizationId: details.workspace.id,
            updatedAt: now,
          })
          .where(eq(schema.session.id, actor.sessionId));
        await tx.insert(schema.auditLog).values({
          organizationId: details.workspace.id,
          actorId: actor.id,
          action: "invitation.accepted",
          entityType: "invitation",
          entityId: input.invitationId,
          after: { role: details.invitation.role },
        });
      }),
    );
    const publication = yield* database.execute(
      "invitation.firstPublication",
      (client) =>
        client.query.blog.findFirst({
          where: eq(schema.blog.organizationId, details.workspace.id),
        }),
    );
    return publication ? BlogId.make(publication.id) : undefined;
  });

  const createApiKey = Effect.fn("WorkspaceManagement.createApiKey")(
    function* (input: CreateApiKeyInput, actor: Actor) {
      const authorization = yield* access.requireIntegrationsManage(
        input.blogId,
        actor.id,
      );
      const name = yield* required(input.name, "Key name");
      const random = yield* crypto.randomBytes(24).pipe(Effect.orDie);
      const token = `pw_${Buffer.from(random).toString("base64url")}`;
      const digest = yield* crypto
        .digest("SHA-256", new TextEncoder().encode(token))
        .pipe(Effect.orDie);
      const apiKeyId = ApiKeyId.make(yield* uuid);
      const scopes = input.allowWrite
        ? ["content:read", "content:write"]
        : ["content:read"];
      yield* database.execute("apiKey.create", (client) =>
        client.transaction(async (tx) => {
          await tx.insert(schema.apiKey).values({
            id: apiKeyId,
            blogId: input.blogId,
            name,
            prefix: token.slice(0, 10),
            keyHash: hex(digest),
            scopes,
          });
          await tx.insert(schema.auditLog).values({
            organizationId: authorization.workspace.id,
            blogId: input.blogId,
            actorId: actor.id,
            action: "api_key.created",
            entityType: "api_key",
            entityId: apiKeyId,
            after: { name, scopes },
          });
        }),
      );
      return token;
    },
  );

  const revokeApiKey = Effect.fn("WorkspaceManagement.revokeApiKey")(
    function* (input: RevokeApiKeyInput, actor: Actor) {
      const authorization = yield* access.requireIntegrationsManage(
        input.blogId,
        actor.id,
      );
      const key = yield* database.execute("apiKey.findForRevocation", (client) =>
        client.query.apiKey.findFirst({
          where: and(
            eq(schema.apiKey.id, input.apiKeyId),
            eq(schema.apiKey.blogId, input.blogId),
          ),
        }),
      );
      if (!key) return yield* new ApiKeyNotFound({ apiKeyId: input.apiKeyId });
      yield* database.execute("apiKey.revoke", (client) =>
        client.transaction(async (tx) => {
          await tx
            .delete(schema.apiKey)
            .where(
              and(
                eq(schema.apiKey.id, input.apiKeyId),
                eq(schema.apiKey.blogId, input.blogId),
              ),
            );
          await tx.insert(schema.auditLog).values({
            organizationId: authorization.workspace.id,
            blogId: input.blogId,
            actorId: actor.id,
            action: "api_key.revoked",
            entityType: "api_key",
            entityId: input.apiKeyId,
            before: { name: key.name, prefix: key.prefix, scopes: key.scopes },
          });
        }),
      );
    },
  );

  return {
    invitationDetails,
    createWorkspace,
    createPublication,
    updateWorkspace,
    switchWorkspace,
    switchPublication,
    inviteMember,
    updateMemberRole,
    removeMember,
    cancelInvitation,
    acceptInvitation,
    createApiKey,
    revokeApiKey,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/WorkspaceManagement",
) {}

export const layer = Layer.effect(Service, create().pipe(Effect.map(Service.of)));

export * as WorkspaceManagement from "./workspace-management";
