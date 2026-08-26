export const teamRoles = [
  "owner",
  "admin",
  "editor",
  "author",
  "viewer",
] as const;

export type TeamRole = (typeof teamRoles)[number];

export const permissions = [
  "workspace:update",
  "workspace:delete",
  "members:manage",
  "publications:create",
  "publications:update",
  "publications:delete",
  "content:read",
  "content:create",
  "content:update:any",
  "content:update:own",
  "content:publish",
  "content:archive",
  "analytics:read",
  "integrations:read",
  "integrations:manage",
  "audit:read",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Record<TeamRole, ReadonlySet<Permission>> = {
  owner: new Set(permissions),
  admin: new Set(
    permissions.filter((permission) => permission !== "workspace:delete"),
  ),
  editor: new Set<Permission>([
    "content:read",
    "content:create",
    "content:update:any",
    "content:publish",
    "content:archive",
    "analytics:read",
    "integrations:read",
  ]),
  author: new Set<Permission>([
    "content:read",
    "content:create",
    "content:update:own",
    "analytics:read",
    "integrations:read",
  ]),
  viewer: new Set<Permission>([
    "content:read",
    "analytics:read",
    "integrations:read",
  ]),
};

const teamRoleSet: ReadonlySet<string> = new Set(teamRoles);

export function isTeamRole(value: string): value is TeamRole {
  return teamRoleSet.has(value);
}

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export function canUpdatePost(
  role: TeamRole,
  createdById: string | null,
  userId: string,
): boolean {
  return (
    hasPermission(role, "content:update:any") ||
    (hasPermission(role, "content:update:own") && createdById === userId)
  );
}
