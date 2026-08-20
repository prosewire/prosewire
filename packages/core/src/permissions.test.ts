import { describe, expect, it } from "vitest";
import {
  canUpdatePost,
  hasPermission,
  isTeamRole,
  permissions,
  teamRoles,
} from "./permissions.ts";

describe("workspace permissions", () => {
  it("keeps the persisted role vocabulary explicit", () => {
    expect(teamRoles).toEqual(["owner", "admin", "editor", "author", "viewer"]);
    expect(isTeamRole("editor")).toBe(true);
    expect(isTeamRole("member")).toBe(false);
  });

  it("reserves workspace and member administration for administrators", () => {
    expect(hasPermission("owner", "workspace:delete")).toBe(true);
    expect(hasPermission("admin", "workspace:delete")).toBe(false);
    expect(hasPermission("admin", "members:manage")).toBe(true);
    expect(hasPermission("editor", "members:manage")).toBe(false);
    expect(hasPermission("admin", "audit:read")).toBe(true);
    expect(hasPermission("editor", "audit:read")).toBe(false);
  });

  it("keeps the complete role-permission matrix explicit", () => {
    const expected = {
      owner: permissions,
      admin: permissions.filter(
        (permission) => permission !== "workspace:delete",
      ),
      editor: [
        "content:read",
        "content:create",
        "content:update:any",
        "content:publish",
        "content:archive",
        "analytics:read",
        "integrations:read",
      ],
      author: [
        "content:read",
        "content:create",
        "content:update:own",
        "analytics:read",
        "integrations:read",
      ],
      viewer: ["content:read", "analytics:read", "integrations:read"],
    } as const;

    for (const role of teamRoles) {
      expect(
        permissions.filter((permission) => hasPermission(role, permission)),
      ).toEqual(expected[role]);
    }
  });

  it("lets authors update only posts they created", () => {
    expect(canUpdatePost("author", "user-a", "user-a")).toBe(true);
    expect(canUpdatePost("author", "user-b", "user-a")).toBe(false);
    expect(canUpdatePost("editor", "user-b", "user-a")).toBe(true);
  });

  it("does not let authors publish or archive", () => {
    expect(hasPermission("author", "content:publish")).toBe(false);
    expect(hasPermission("author", "content:archive")).toBe(false);
    expect(hasPermission("editor", "content:publish")).toBe(true);
  });
});
