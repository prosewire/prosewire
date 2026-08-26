import type { TeamRole } from "@prosewire/core";

export interface NamedSelection {
  readonly id: string;
  readonly name: string;
}

export interface DashboardShellProps {
  readonly userName: string;
  readonly canCreatePublication: boolean;
  readonly canCreateWorkspace: boolean;
  readonly canReadAudit: boolean;
  readonly showWorkspaceSwitcher: boolean;
  readonly role: TeamRole;
  readonly workspace: NamedSelection;
  readonly workspaces: ReadonlyArray<NamedSelection>;
  readonly publication: NamedSelection;
  readonly publications: ReadonlyArray<NamedSelection>;
}
