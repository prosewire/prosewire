import { hasPermission, type Permission, type TeamRole } from "@prosewire/core";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  publication: ["create", "update", "delete"],
  content: ["create", "read", "update", "publish", "archive"],
  analytics: ["read"],
  integration: ["read", "manage"],
} as const;

export const organizationAccess = createAccessControl(statement);

function roleStatements(role: TeamRole) {
  const allowed = <A extends string>(
    grants: ReadonlyArray<readonly [A, Permission]>,
  ) =>
    grants
      .filter(([, permission]) => hasPermission(role, permission))
      .map(([action]) => action);
  return {
    // BetterAuth team/dynamic-role endpoints are disabled; preserve their
    // legacy statements while deriving administrative access from core.
    team: allowed([
      ["create", "members:manage"],
      ["update", "members:manage"],
      ["delete", "members:manage"],
    ]),
    ac: hasPermission(role, "members:manage")
      ? (["create", "read", "update", "delete"] as const)
      : (["read"] as const),
    organization: allowed([
      ["update", "workspace:update"],
      ["delete", "workspace:delete"],
    ]),
    member: allowed([
      ["create", "members:manage"],
      ["update", "members:manage"],
      ["delete", "members:manage"],
    ]),
    invitation: allowed([
      ["create", "members:manage"],
      ["cancel", "members:manage"],
    ]),
    publication: allowed([
      ["create", "publications:create"],
      ["update", "publications:update"],
      ["delete", "publications:delete"],
    ]),
    content: allowed([
      ["create", "content:create"],
      ["read", "content:read"],
      [
        "update",
        hasPermission(role, "content:update:any")
          ? "content:update:any"
          : "content:update:own",
      ],
      ["publish", "content:publish"],
      ["archive", "content:archive"],
    ]),
    analytics: allowed([["read", "analytics:read"]]),
    integration: allowed([
      ["read", "integrations:read"],
      ["manage", "integrations:manage"],
    ]),
  };
}

export const ownerRole = organizationAccess.newRole(roleStatements("owner"));
export const adminRole = organizationAccess.newRole(roleStatements("admin"));
export const editorRole = organizationAccess.newRole(roleStatements("editor"));
export const authorRole = organizationAccess.newRole(roleStatements("author"));
export const viewerRole = organizationAccess.newRole(roleStatements("viewer"));

export const organizationRoles = {
  owner: ownerRole,
  admin: adminRole,
  editor: editorRole,
  author: authorRole,
  viewer: viewerRole,
  member: viewerRole,
};
