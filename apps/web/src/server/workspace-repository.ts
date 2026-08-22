import { Buffer } from "node:buffer";
import {
  type TeamRole as CoreTeamRole,
  isTeamRole,
  slugify,
} from "@prosewire/core";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { Clock, Context, Crypto, Effect, Layer, Result, Schema } from "effect";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import {
  decodeWorkspace,
  Workspace,
  WorkspaceInvitation,
} from "./content-models.ts";
import { Database } from "./database.ts";
import {
  ApiKeyId,
  BlogId,
  InvitationId,
  MemberId,
  OrganizationId,
  UserId,
} from "./domain.ts";
import { operationError } from "./operation-error.ts";
import {
  lockBlogAuthorization,
  lockWorkspaceAuthorization,
} from "./transactional-access.ts";

const EditableRole = Schema.Literals(["admin", "editor", "author", "viewer"]);

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

export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "WorkspaceRepositoryPersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

export type Error =
  | PersistenceError
  | BlogAccess.Error
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
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(
    /[&<>"']/g,
    (character) => replacements[character] ?? character,
  );
}

export const create = Effect.fn("WorkspaceRepository.create")(function* () {
  const database = yield* Database;
  const crypto = yield* Crypto.Crypto;
  const config = yield* WebConfig;

  const uuid = crypto.randomUUIDv4.pipe(Effect.orDie);
  const persistenceError = operationError(
    (input) => new PersistenceError(input),
  );
  const execute = <A>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<A>,
  ) => database.execute(operation, evaluate).pipe(persistenceError(operation));

  const executeResult = <A, E>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<Result.Result<A, E>>,
  ): Effect.Effect<A, PersistenceError | E> =>
    execute(operation, evaluate).pipe(
      Effect.flatMap(
        Result.match({
          onFailure: Effect.fail,
          onSuccess: Effect.succeed,
        }),
      ),
    );

  const invitationDetails = Effect.fn("WorkspaceManagement.invitationDetails")(
    function* (invitationId: InvitationId, emailAddress?: string) {
      const now = new Date(yield* Clock.currentTimeMillis);
      const rows = yield* execute("invitation.getDetails", (client) =>
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
      if (!row || !invitation) return undefined;
      const workspace = yield* decodeWorkspace(row.workspace).pipe(
        persistenceError("workspace.decodeInvitation"),
      );
      return new InvitationDetails({ invitation, workspace });
    },
  );

  const createWorkspace = Effect.fn("WorkspaceManagement.createWorkspace")(
    function* (input: CreateWorkspaceInput, actor: Actor) {
      const workspaceName = yield* required(
        input.workspaceName,
        "Workspace name",
      );
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
      const publication = yield* execute("workspace.create", (client) =>
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

  const createPublication = Effect.fn("WorkspaceManagement.createPublication")(
    function* (input: CreatePublicationInput, actor: Actor) {
      const name = yield* required(input.name, "Publication name");
      const slug = yield* requiredSlug(input.slug, name, "Publication slug");
      const authorSlug = yield* requiredSlug(
        actor.name,
        actor.email,
        "Author name",
      );
      return yield* executeResult<BlogId, BlogAccess.WorkspaceAccessDenied>(
        "publication.create",
        (client) =>
          client.transaction(async (tx) => {
            const authorization = await lockWorkspaceAuthorization(
              tx,
              input.organizationId,
              actor.id,
              "publications:create",
            );
            if (!authorization) {
              return Result.fail(
                new BlogAccess.WorkspaceAccessDenied({
                  organizationId: input.organizationId,
                  userId: actor.id,
                  capability: "publications:create",
                }),
              );
            }
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
            return Result.succeed(BlogId.make(publication.id));
          }),
      );
    },
  );

  const updateWorkspace = Effect.fn("WorkspaceManagement.updateWorkspace")(
    function* (input: UpdateWorkspaceInput, actor: Actor) {
      const name = yield* required(input.name, "Workspace name");
      yield* executeResult<void, BlogAccess.WorkspaceAccessDenied>(
        "workspace.update",
        (client) =>
          client.transaction(async (tx) => {
            const authorization = await lockWorkspaceAuthorization(
              tx,
              input.organizationId,
              actor.id,
              "workspace:update",
            );
            if (!authorization) {
              return Result.fail(
                new BlogAccess.WorkspaceAccessDenied({
                  organizationId: input.organizationId,
                  userId: actor.id,
                  capability: "workspace:update",
                }),
              );
            }
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
            return Result.succeed(undefined);
          }),
      );
    },
  );

  const switchWorkspace = Effect.fn("WorkspaceManagement.switchWorkspace")(
    function* (organizationId: OrganizationId, actor: Actor) {
      const now = new Date(yield* Clock.currentTimeMillis);
      return yield* executeResult<
        BlogId | undefined,
        BlogAccess.WorkspaceAccessDenied
      >("workspace.switch", (client) =>
        client.transaction(async (tx) => {
          const lockedAuthorization = await lockWorkspaceAuthorization(
            tx,
            organizationId,
            actor.id,
            "content:read",
          );
          if (!lockedAuthorization) {
            return Result.fail(
              new BlogAccess.WorkspaceAccessDenied({
                organizationId,
                userId: actor.id,
                capability: "content:read",
              }),
            );
          }
          await tx
            .update(schema.session)
            .set({ activeOrganizationId: organizationId, updatedAt: now })
            .where(eq(schema.session.id, actor.sessionId));
          const publication = await tx.query.blog.findFirst({
            where: eq(schema.blog.organizationId, organizationId),
          });
          return Result.succeed(
            publication ? BlogId.make(publication.id) : undefined,
          );
        }),
      );
    },
  );

  const switchPublication = Effect.fn("WorkspaceManagement.switchPublication")(
    function* (blogId: BlogId, actor: Actor) {
      const now = new Date(yield* Clock.currentTimeMillis);
      return yield* executeResult<
        BlogAccess.BlogAuthorization,
        BlogAccess.BlogAccessDenied
      >("publication.switch", (client) =>
        client.transaction(async (tx) => {
          const authorization = await lockBlogAuthorization(
            tx,
            blogId,
            actor.id,
            "content:read",
          );
          if (!authorization) {
            return Result.fail(
              new BlogAccess.BlogAccessDenied({
                blogId,
                userId: actor.id,
                capability: "content:read",
              }),
            );
          }
          await tx
            .update(schema.session)
            .set({
              activeOrganizationId: authorization.workspace.id,
              updatedAt: now,
            })
            .where(eq(schema.session.id, actor.sessionId));
          return Result.succeed(authorization);
        }),
      );
    },
  );

  const inviteMember = Effect.fn("WorkspaceManagement.inviteMember")(function* (
    input: InviteMemberInput,
    actor: Actor,
  ) {
    const recipient = input.email.trim().toLowerCase();
    if (!recipient || !recipient.includes("@")) {
      return yield* new InvalidWorkspaceInput({
        message: "Enter a valid email address",
      });
    }
    const existingUser = yield* execute(
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
    const invitationUrl = `${config.publicUrl}/accept-invitation/${invitationId}`;
    yield* executeResult<void, BlogAccess.WorkspaceAccessDenied>(
      "invitation.create",
      (client) =>
        client.transaction(async (tx) => {
          const authorization = await lockWorkspaceAuthorization(
            tx,
            input.organizationId,
            actor.id,
            "members:manage",
          );
          if (!authorization) {
            return Result.fail(
              new BlogAccess.WorkspaceAccessDenied({
                organizationId: input.organizationId,
                userId: actor.id,
                capability: "members:manage",
              }),
            );
          }
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${recipient}`}, 0))`,
          );
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
          const workspaceName = authorization.workspace.name;
          await tx.insert(schema.emailOutbox).values({
            recipient,
            subject: `Join ${workspaceName} on Prosewire`,
            textBody: `${actor.name} invited you to join ${workspaceName} as ${input.role}. Accept the invitation: ${invitationUrl}`,
            htmlBody: `<p>${escapeHtml(actor.name)} invited you to join <strong>${escapeHtml(workspaceName)}</strong> as ${escapeHtml(input.role)}.</p><p><a href="${escapeHtml(invitationUrl)}">Accept invitation</a></p>`,
          });
          return Result.succeed(undefined);
        }),
    );
    return invitationId;
  });

  const updateMemberRole = Effect.fn("WorkspaceManagement.updateMemberRole")(
    function* (input: UpdateMemberRoleInput, actor: Actor) {
      yield* executeResult<
        void,
        BlogAccess.WorkspaceAccessDenied | MemberNotFound | ProtectedMember
      >("member.updateRole", (client) =>
        client.transaction(async (tx) => {
          const authorization = await lockWorkspaceAuthorization(
            tx,
            input.organizationId,
            actor.id,
            "members:manage",
          );
          if (!authorization) {
            return Result.fail(
              new BlogAccess.WorkspaceAccessDenied({
                organizationId: input.organizationId,
                userId: actor.id,
                capability: "members:manage",
              }),
            );
          }
          const [target] = await tx
            .select()
            .from(schema.member)
            .where(
              and(
                eq(schema.member.id, input.memberId),
                eq(schema.member.organizationId, input.organizationId),
              ),
            )
            .for("update");
          if (!target) {
            return Result.fail(
              new MemberNotFound({ memberId: input.memberId }),
            );
          }
          if (target.role === "owner" || target.userId === actor.id) {
            return Result.fail(
              new ProtectedMember({
                message:
                  "The owner role and your own membership cannot be changed here",
              }),
            );
          }
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
          return Result.succeed(undefined);
        }),
      );
    },
  );

  const removeMember = Effect.fn("WorkspaceManagement.removeMember")(function* (
    input: MemberMutationInput,
    actor: Actor,
  ) {
    yield* executeResult<
      void,
      BlogAccess.WorkspaceAccessDenied | MemberNotFound | ProtectedMember
    >("member.remove", (client) =>
      client.transaction(async (tx) => {
        const authorization = await lockWorkspaceAuthorization(
          tx,
          input.organizationId,
          actor.id,
          "members:manage",
        );
        if (!authorization) {
          return Result.fail(
            new BlogAccess.WorkspaceAccessDenied({
              organizationId: input.organizationId,
              userId: actor.id,
              capability: "members:manage",
            }),
          );
        }
        const [target] = await tx
          .select()
          .from(schema.member)
          .where(
            and(
              eq(schema.member.id, input.memberId),
              eq(schema.member.organizationId, input.organizationId),
            ),
          )
          .for("update");
        if (!target) {
          return Result.fail(new MemberNotFound({ memberId: input.memberId }));
        }
        if (target.role === "owner" || target.userId === actor.id) {
          return Result.fail(
            new ProtectedMember({
              message:
                "The owner and your own membership cannot be removed here",
            }),
          );
        }
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
        return Result.succeed(undefined);
      }),
    );
  });

  const cancelInvitation = Effect.fn("WorkspaceManagement.cancelInvitation")(
    function* (
      organizationId: OrganizationId,
      input: InvitationMutationInput,
      actor: Actor,
    ) {
      const canceled = yield* executeResult<
        boolean,
        BlogAccess.WorkspaceAccessDenied
      >("invitation.cancel", (client) =>
        client.transaction(async (tx) => {
          const authorization = await lockWorkspaceAuthorization(
            tx,
            organizationId,
            actor.id,
            "members:manage",
          );
          if (!authorization) {
            return Result.fail(
              new BlogAccess.WorkspaceAccessDenied({
                organizationId,
                userId: actor.id,
                capability: "members:manage",
              }),
            );
          }
          const [invitation] = await tx
            .update(schema.invitation)
            .set({ status: "canceled" })
            .where(
              and(
                eq(schema.invitation.id, input.invitationId),
                eq(schema.invitation.organizationId, organizationId),
                eq(schema.invitation.status, "pending"),
              ),
            )
            .returning({
              email: schema.invitation.email,
              role: schema.invitation.role,
            });
          if (!invitation) return Result.succeed(false);
          await tx.insert(schema.auditLog).values({
            organizationId,
            actorId: actor.id,
            action: "invitation.canceled",
            entityType: "invitation",
            entityId: input.invitationId,
            before: { email: invitation.email, role: invitation.role },
          });
          return Result.succeed(true);
        }),
      );
      if (!canceled) {
        return yield* new InvitationNotFound({
          invitationId: input.invitationId,
        });
      }
    },
  );

  const acceptInvitation = Effect.fn("WorkspaceManagement.acceptInvitation")(
    function* (input: InvitationMutationInput, actor: Actor) {
      const memberId = MemberId.make(yield* uuid);
      const now = new Date(yield* Clock.currentTimeMillis);
      const accepted = yield* execute("invitation.accept", (client) =>
        client.transaction(async (tx) => {
          const [invitation] = await tx
            .update(schema.invitation)
            .set({ status: "accepted" })
            .where(
              and(
                eq(schema.invitation.id, input.invitationId),
                eq(schema.invitation.email, actor.email.toLowerCase()),
                eq(schema.invitation.status, "pending"),
                gt(schema.invitation.expiresAt, now),
              ),
            )
            .returning({
              organizationId: schema.invitation.organizationId,
              role: schema.invitation.role,
            });
          if (!invitation) return undefined;
          const role = normalizeRole(invitation.role);
          if (!role) throw new Error("Invitation has an invalid role");
          await tx
            .insert(schema.member)
            .values({
              id: memberId,
              organizationId: invitation.organizationId,
              userId: actor.id,
              role,
            })
            .onConflictDoNothing({
              target: [schema.member.organizationId, schema.member.userId],
            });
          await tx
            .update(schema.session)
            .set({
              activeOrganizationId: invitation.organizationId,
              updatedAt: now,
            })
            .where(eq(schema.session.id, actor.sessionId));
          await tx.insert(schema.auditLog).values({
            organizationId: invitation.organizationId,
            actorId: actor.id,
            action: "invitation.accepted",
            entityType: "invitation",
            entityId: input.invitationId,
            after: { role },
          });
          return {
            organizationId: OrganizationId.make(invitation.organizationId),
          };
        }),
      );
      if (!accepted) {
        return yield* new InvitationNotFound({
          invitationId: input.invitationId,
        });
      }
      const publication = yield* execute(
        "invitation.firstPublication",
        (client) =>
          client.query.blog.findFirst({
            where: eq(schema.blog.organizationId, accepted.organizationId),
          }),
      );
      return publication ? BlogId.make(publication.id) : undefined;
    },
  );

  const createApiKey = Effect.fn("WorkspaceManagement.createApiKey")(function* (
    input: CreateApiKeyInput,
    actor: Actor,
  ) {
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
    yield* executeResult<void, BlogAccess.BlogAccessDenied>(
      "apiKey.create",
      (client) =>
        client.transaction(async (tx) => {
          const authorization = await lockBlogAuthorization(
            tx,
            input.blogId,
            actor.id,
            "integrations:manage",
          );
          if (!authorization) {
            return Result.fail(
              new BlogAccess.BlogAccessDenied({
                blogId: input.blogId,
                userId: actor.id,
                capability: "integrations:manage",
              }),
            );
          }
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
          return Result.succeed(undefined);
        }),
    );
    return token;
  });

  const revokeApiKey = Effect.fn("WorkspaceManagement.revokeApiKey")(function* (
    input: RevokeApiKeyInput,
    actor: Actor,
  ) {
    yield* executeResult<void, BlogAccess.BlogAccessDenied | ApiKeyNotFound>(
      "apiKey.revoke",
      (client) =>
        client.transaction(async (tx) => {
          const authorization = await lockBlogAuthorization(
            tx,
            input.blogId,
            actor.id,
            "integrations:manage",
          );
          if (!authorization) {
            return Result.fail(
              new BlogAccess.BlogAccessDenied({
                blogId: input.blogId,
                userId: actor.id,
                capability: "integrations:manage",
              }),
            );
          }
          const [key] = await tx
            .select()
            .from(schema.apiKey)
            .where(
              and(
                eq(schema.apiKey.id, input.apiKeyId),
                eq(schema.apiKey.blogId, input.blogId),
              ),
            )
            .for("update");
          if (!key) {
            return Result.fail(
              new ApiKeyNotFound({ apiKeyId: input.apiKeyId }),
            );
          }
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
          return Result.succeed(undefined);
        }),
    );
  });

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
  "@prosewire/web/WorkspaceRepository",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export * as WorkspaceRepository from "./workspace-repository";
