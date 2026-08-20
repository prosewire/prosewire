export const teamRoles = ["owner", "admin", "editor", "author", "viewer"] as const;

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

const rolePermissions = {
  owner: permissions,
  admin: permissions.filter((permission) => permission !== "workspace:delete"),
  editor: [
    "content:read",
    "content:create",
    "content:update:any",
    "content:publish",
    "content:archive",
    "analytics:read",
    "integrations:read",
  ],
  author: ["content:read", "content:create", "content:update:own", "analytics:read", "integrations:read"],
  viewer: ["content:read", "analytics:read", "integrations:read"],
} satisfies Record<TeamRole, readonly Permission[]>;

export function isTeamRole(value: string): value is TeamRole {
  return (teamRoles as readonly string[]).includes(value);
}

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission as never);
}

export function canUpdatePost(role: TeamRole, createdById: string | null, userId: string): boolean {
  return hasPermission(role, "content:update:any") ||
    (hasPermission(role, "content:update:own") && createdById === userId);
}
