import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  publication: ["create", "update", "delete"],
  content: ["create", "read", "update", "publish", "archive"],
  analytics: ["read"],
  integration: ["read", "manage"],
} as const;

export const organizationAccess = createAccessControl(statement);

export const ownerRole = organizationAccess.newRole({
  ...ownerAc.statements,
  publication: ["create", "update", "delete"],
  content: ["create", "read", "update", "publish", "archive"],
  analytics: ["read"],
  integration: ["read", "manage"],
});

export const adminRole = organizationAccess.newRole({
  ...adminAc.statements,
  publication: ["create", "update", "delete"],
  content: ["create", "read", "update", "publish", "archive"],
  analytics: ["read"],
  integration: ["read", "manage"],
});

export const editorRole = organizationAccess.newRole({
  ...memberAc.statements,
  publication: [],
  content: ["create", "read", "update", "publish", "archive"],
  analytics: ["read"],
  integration: ["read"],
});

export const authorRole = organizationAccess.newRole({
  ...memberAc.statements,
  publication: [],
  content: ["create", "read", "update"],
  analytics: ["read"],
  integration: ["read"],
});

export const viewerRole = organizationAccess.newRole({
  ...memberAc.statements,
  publication: [],
  content: ["read"],
  analytics: ["read"],
  integration: ["read"],
});

export const organizationRoles = {
  owner: ownerRole,
  admin: adminRole,
  editor: editorRole,
  author: authorRole,
  viewer: viewerRole,
  member: viewerRole,
};
