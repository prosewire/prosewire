import { Schema } from "effect";
import {
  Blog,
  TeamRole,
  Workspace,
} from "./content-models.ts";
import { MemberId, UserId } from "./domain.ts";

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

export * as AuthorizationModels from "./authorization-models";
