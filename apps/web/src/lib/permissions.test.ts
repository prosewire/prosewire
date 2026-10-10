import { hasPermission, type Permission, teamRoles } from "@prosewire/core";
import {
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { describe, expect, it } from "vitest";
import { organizationRoles } from "./permissions.ts";

describe("BetterAuth role adapter", () => {
  it("derives supported permission statements from the core policy", () => {
    const mapping: Record<string, Record<string, Permission>> = {
      organization: { update: "workspace:update", delete: "workspace:delete" },
      member: {
        create: "members:manage",
        update: "members:manage",
        delete: "members:manage",
      },
      invitation: { create: "members:manage", cancel: "members:manage" },
      publication: {
        create: "publications:create",
        update: "publications:update",
        delete: "publications:delete",
      },
      content: {
        create: "content:create",
        read: "content:read",
        publish: "content:publish",
        archive: "content:archive",
      },
      analytics: { read: "analytics:read" },
      integration: { read: "integrations:read", manage: "integrations:manage" },
    };
    for (const role of teamRoles) {
      const statements = organizationRoles[role].statements as Record<
        string,
        ReadonlyArray<string>
      >;
      for (const [resource, actions] of Object.entries(mapping)) {
        for (const [action, permission] of Object.entries(actions)) {
          expect(statements[resource]?.includes(action) ?? false).toBe(
            hasPermission(role, permission),
          );
        }
      }
      expect(statements.content?.includes("update")).toBe(
        hasPermission(role, "content:update:any") ||
          hasPermission(role, "content:update:own"),
      );
    }
    expect(organizationRoles.member).toBe(organizationRoles.viewer);
  });
  it("preserves BetterAuth default organization, team, and dynamic-role statements", () => {
    for (const role of teamRoles) {
      const expected =
        role === "owner" ? ownerAc : role === "admin" ? adminAc : memberAc;
      for (const resource of [
        "organization",
        "member",
        "invitation",
        "team",
        "ac",
      ] as const) {
        expect(organizationRoles[role].statements[resource]).toEqual(
          expected.statements[resource],
        );
      }
    }
  });
});
