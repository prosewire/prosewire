import { Context, Effect, Layer } from "effect";
import { WorkspaceRepository } from "./workspace-repository.ts";

export type { Actor, Error } from "./workspace-repository.ts";
export {
  ApiKeyNotFound,
  CreateApiKeyInput,
  CreatePublicationInput,
  CreateWorkspaceInput,
  InvalidWorkspaceInput,
  InvitationDetails,
  InvitationMutationInput,
  InvitationNotFound,
  InviteMemberInput,
  MemberMutationInput,
  MemberNotFound,
  ProtectedMember,
  RevokeApiKeyInput,
  SelfHostedWorkspaceAlreadyExists,
  UpdateMemberRoleInput,
  UpdateWorkspaceInput,
} from "./workspace-repository.ts";

export const create = Effect.fn("WorkspaceManagement.create")(function* () {
  const repository = yield* WorkspaceRepository.Service;
  return {
    invitationDetails: repository.invitationDetails,
    hasInstallation: repository.hasInstallation,
    hasWorkspace: repository.hasWorkspace,
    createWorkspace: repository.createWorkspace,
    createPublication: repository.createPublication,
    updateWorkspace: repository.updateWorkspace,
    switchWorkspace: repository.switchWorkspace,
    switchPublication: repository.switchPublication,
    inviteMember: repository.inviteMember,
    updateMemberRole: repository.updateMemberRole,
    removeMember: repository.removeMember,
    cancelInvitation: repository.cancelInvitation,
    acceptInvitation: repository.acceptInvitation,
    createApiKey: repository.createApiKey,
    revokeApiKey: repository.revokeApiKey,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/WorkspaceManagement",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export const live = layer.pipe(Layer.provide(WorkspaceRepository.layer));

export * as WorkspaceManagement from "./workspace-management";
