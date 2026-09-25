import { Effect, Option, Schema } from "effect";
import { io } from "next/cache";
import { socialProviderIds } from "@/lib/auth-providers";
import {
  getDashboardSessionEffect,
  requireDashboardSessionEffect,
} from "@/lib/session";
import { runAppEffect } from "./app-runtime.ts";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { BlogId, InvitationId, OrganizationId, UserId } from "./domain.ts";
import { WorkspaceRepository } from "./workspace-repository.ts";

const invalidInput = (message: string) =>
  new WorkspaceRepository.InvalidWorkspaceInput({ message });

const decode = <S extends Schema.Top>(
  schema: S,
  value: unknown,
  message: string,
) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(() => invalidInput(message)),
  );

const currentActor = Effect.fn("WorkspaceEntrypoints.currentActor")(
  function* () {
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
  },
);

export type CreateWorkspaceBoundaryInput =
  typeof WorkspaceRepository.CreateWorkspaceInput.Encoded;
export type CreatePublicationBoundaryInput =
  typeof WorkspaceRepository.CreatePublicationInput.Encoded;
type UpdateWorkspaceBoundaryInput =
  typeof WorkspaceRepository.UpdateWorkspaceInput.Encoded;
type InviteMemberBoundaryInput = Omit<
  typeof WorkspaceRepository.InviteMemberInput.Encoded,
  "role"
> & { readonly role: string };
type UpdateMemberRoleBoundaryInput = Omit<
  typeof WorkspaceRepository.UpdateMemberRoleInput.Encoded,
  "role"
> & { readonly role: string };
type MemberMutationBoundaryInput =
  typeof WorkspaceRepository.MemberMutationInput.Encoded;
type CreateApiKeyBoundaryInput =
  typeof WorkspaceRepository.CreateApiKeyInput.Encoded;
type RevokeApiKeyBoundaryInput =
  typeof WorkspaceRepository.RevokeApiKeyInput.Encoded;

export function createWorkspace(input: CreateWorkspaceBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.CreateWorkspaceInput,
        input,
        "Invalid workspace details",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
      return yield* service.createWorkspace(command, actor);
    }),
  );
}

export function createPublication(input: CreatePublicationBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.CreatePublicationInput,
        input,
        "Invalid publication details",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
      return yield* service.createPublication(command, actor);
    }),
  );
}

export function updateWorkspace(input: UpdateWorkspaceBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.UpdateWorkspaceInput,
        input,
        "Invalid workspace settings",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
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
      const service = yield* WorkspaceRepository.Service;
      return yield* service.switchWorkspace(id, actor);
    }),
  );
}

export function switchPublication(blogId: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const id = yield* decode(BlogId, blogId, "Invalid publication");
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
      return yield* service.switchPublication(id, actor);
    }),
  );
}

export function inviteMember(input: InviteMemberBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.InviteMemberInput,
        input,
        "Invalid invitation",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
      return yield* service.inviteMember(command, actor);
    }),
  );
}

export function updateMemberRole(input: UpdateMemberRoleBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.UpdateMemberRoleInput,
        input,
        "Invalid member role",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
      return yield* service.updateMemberRole(command, actor);
    }),
  );
}

export function removeMember(input: MemberMutationBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.MemberMutationInput,
        input,
        "Invalid member",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
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
        WorkspaceRepository.InvitationMutationInput,
        { invitationId: input.invitationId },
        "Invalid invitation",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
      return yield* service.cancelInvitation(organizationId, command, actor);
    }),
  );
}

export function acceptInvitation(invitationId: string) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.InvitationMutationInput,
        { invitationId },
        "Invalid invitation",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
      return yield* service.acceptInvitation(command, actor);
    }),
  );
}

export function createApiKey(input: CreateApiKeyBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.CreateApiKeyInput,
        input,
        "Invalid API key details",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
      return yield* service.createApiKey(command, actor);
    }),
  );
}

export function revokeApiKey(input: RevokeApiKeyBoundaryInput) {
  return runAppEffect(
    Effect.gen(function* () {
      const command = yield* decode(
        WorkspaceRepository.RevokeApiKeyInput,
        input,
        "Invalid API key",
      );
      const { actor } = yield* currentActor();
      const service = yield* WorkspaceRepository.Service;
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
      const config = yield* WebConfig;
      const workspaces = yield* access.findWorkspaces(actor.id);
      let selfHostedTeamExists = false;
      if (config.deployment === "self-hosted") {
        const management = yield* WorkspaceRepository.Service;
        selfHostedTeamExists = yield* management.hasWorkspace();
      }
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
        cloudDeployment: config.deployment === "cloud",
        selfHostedTeamExists,
      };
    }),
  );
}

export async function loadInvitation(invitationId: string) {
  const parsed = Schema.decodeOption(InvitationId)(invitationId);
  if (Option.isNone(parsed)) {
    return Promise.resolve({
      session: null,
      details: undefined,
      cloudDeployment: false,
    });
  }
  await io();
  return runAppEffect(
    Effect.gen(function* () {
      const session = yield* getDashboardSessionEffect();
      const config = yield* WebConfig;
      const service = yield* WorkspaceRepository.Service;
      const details = yield* service.invitationDetails(
        parsed.value,
        session?.user.email,
      );
      return {
        session,
        details,
        cloudDeployment: config.deployment === "cloud",
      };
    }),
  );
}

export async function loadAuthenticationState(invitationId?: string) {
  await io();
  return runAppEffect(
    Effect.gen(function* () {
      const session = yield* getDashboardSessionEffect();
      const config = yield* WebConfig;
      const cloudDeployment = config.deployment === "cloud";
      let openRegistration =
        config.environment !== "production" || config.allowSignUp;
      if (openRegistration && !cloudDeployment) {
        const service = yield* WorkspaceRepository.Service;
        openRegistration = !(yield* service.hasInstallation());
      }
      const socialProviders = socialProviderIds.filter(
        (provider) => config.cloudSocialProviders?.[provider] !== undefined,
      );
      if (!invitationId) {
        return {
          session,
          openRegistration,
          cloudDeployment,
          socialProviders,
          invitation: undefined,
        };
      }
      const parsed = Schema.decodeOption(InvitationId)(invitationId);
      if (Option.isNone(parsed)) {
        return {
          session,
          openRegistration,
          cloudDeployment,
          socialProviders,
          invitation: undefined,
        };
      }
      const service = yield* WorkspaceRepository.Service;
      const details = yield* service.invitationDetails(parsed.value);
      return {
        session,
        openRegistration,
        cloudDeployment,
        socialProviders,
        invitation: details?.invitation,
      };
    }),
  );
}

export * as WorkspaceEntrypoints from "./workspace-entrypoints";
