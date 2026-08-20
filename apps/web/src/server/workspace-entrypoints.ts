import { Effect, Option, Schema } from "effect";
import { io } from "next/cache";
import {
  getDashboardSessionEffect,
  requireDashboardSessionEffect,
} from "@/lib/session";
import { BlogAccess } from "./authorization.ts";
import { runAppEffect } from "./app-runtime.ts";
import { WebConfig } from "./config.ts";
import {
  BlogId,
  InvitationId,
  OrganizationId,
  UserId,
} from "./domain.ts";
import { WorkspaceManagement } from "./workspace-management.ts";

const invalidInput = (message: string) =>
  new WorkspaceManagement.InvalidWorkspaceInput({ message });

const decode = <S extends Schema.Top>(schema: S, value: unknown, message: string) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(() => invalidInput(message)),
  );

const currentActor = Effect.fn("WorkspaceEntrypoints.currentActor")(function* () {
  const session = yield* requireDashboardSessionEffect();
  return {
    session,
    actor: {
      id: UserId.make(session.user.id),
      name: session.user.name,
      email: session.user.email,
      sessionId: session.session.id,
    },
  };
});

export interface CreateWorkspaceBoundaryInput {
  readonly workspaceName: string;
  readonly workspaceSlug: string;
  readonly publicationName: string;
  readonly publicationSlug: string;
}

export function createWorkspace(input: CreateWorkspaceBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.CreateWorkspaceInput,
        input,
        "Invalid workspace details",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.createWorkspace(command, actor);
    }),
  );
}

export interface CreatePublicationBoundaryInput {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
}

export function createPublication(input: CreatePublicationBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.CreatePublicationInput,
        input,
        "Invalid publication details",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.createPublication(command, actor);
    }),
  );
}

export function updateWorkspace(input: {
  readonly organizationId: string;
  readonly name: string;
}) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.UpdateWorkspaceInput,
        input,
        "Invalid workspace settings",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.updateWorkspace(command, actor);
    }),
  );
}

export function switchWorkspace(organizationId: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const id = yield* decode(
        OrganizationId,
        organizationId,
        "Invalid workspace",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.switchWorkspace(id, actor);
    }),
  );
}

export function switchPublication(blogId: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const id = yield* decode(BlogId, blogId, "Invalid publication");
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.switchPublication(id, actor);
    }),
  );
}

export function inviteMember(input: {
  readonly organizationId: string;
  readonly email: string;
  readonly role: string;
}) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.InviteMemberInput,
        input,
        "Invalid invitation",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.inviteMember(command, actor);
    }),
  );
}

export function updateMemberRole(input: {
  readonly organizationId: string;
  readonly memberId: string;
  readonly role: string;
}) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.UpdateMemberRoleInput,
        input,
        "Invalid member role",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.updateMemberRole(command, actor);
    }),
  );
}

export function removeMember(input: {
  readonly organizationId: string;
  readonly memberId: string;
}) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.MemberMutationInput,
        input,
        "Invalid member",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.removeMember(command, actor);
    }),
  );
}

export function cancelInvitation(input: {
  readonly organizationId: string;
  readonly invitationId: string;
}) {
  return runAppEffect(
    Effect.gen(function* () {
      const organizationId = yield* decode(
        OrganizationId,
        input.organizationId,
        "Invalid workspace",
      );
      const command = yield* decode(
        WorkspaceManagement.InvitationMutationInput,
        { invitationId: input.invitationId },
        "Invalid invitation",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.cancelInvitation(organizationId, command, actor);
    }),
  );
}

export function acceptInvitation(invitationId: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.InvitationMutationInput,
        { invitationId },
        "Invalid invitation",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.acceptInvitation(command, actor);
    }),
  );
}

export function createApiKey(input: {
  readonly blogId: string;
  readonly name: string;
  readonly allowWrite: boolean;
}) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.CreateApiKeyInput,
        input,
        "Invalid API key details",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.createApiKey(command, actor);
    }),
  );
}

export function revokeApiKey(input: {
  readonly blogId: string;
  readonly apiKeyId: string;
}) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceManagement.RevokeApiKeyInput,
        input,
        "Invalid API key",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceManagement.Service;
      return yield* service.revokeApiKey(command, actor);
    }),
  );
}

export async function loadOnboarding() {
  await io();
  return runAppEffect(
    Effect.gen(function* () {
      const { session, actor } = yield* currentActor();
      const access = yield* BlogAccess.Service;
      const workspaces = yield* access.findWorkspaces(actor.id);
      const activeId = Schema.decodeUnknownOption(OrganizationId)(
        session.session.activeOrganizationId,
      );
      const selected =
        workspaces.find(
          (entry) =>
            Option.isSome(activeId) && entry.workspace.id === activeId.value,
        ) ?? workspaces[0];
      return {
        session,
        workspace: selected?.workspace,
        role: selected?.role,
      };
    }),
  );
}

export async function loadInvitation(invitationId: string) {
  const parsed = Schema.decodeUnknownOption(InvitationId)(invitationId);
  if (Option.isNone(parsed)) {
    return Promise.resolve({ session: null, details: undefined });
  }
  await io();
  return runAppEffect(
    Effect.gen(function* () {
      const session = yield* getDashboardSessionEffect();
      const service = yield* WorkspaceManagement.Service;
      const details = yield* service.invitationDetails(
        parsed.value,
        session?.user.email,
      );
      return { session, details };
    }),
  );
}

export async function loadAuthenticationState(invitationId?: string) {
  await io();
  return runAppEffect(
    Effect.gen(function* () {
      const session = yield* getDashboardSessionEffect();
      const config = yield* WebConfig;
      const openRegistration =
        config.environment !== "production" || config.allowSignUp;
      if (!invitationId) {
        return { session, openRegistration, invitation: undefined };
      }
      const parsed = Schema.decodeUnknownOption(InvitationId)(invitationId);
      if (Option.isNone(parsed)) {
        return { session, openRegistration, invitation: undefined };
      }
      const service = yield* WorkspaceManagement.Service;
      const details = yield* service.invitationDetails(parsed.value);
      return { session, openRegistration, invitation: details?.invitation };
    }),
  );
}

export * as WorkspaceEntrypoints from "./workspace-entrypoints";
