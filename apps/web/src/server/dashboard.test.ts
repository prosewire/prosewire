import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Redacted } from "effect";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { ContentQueries } from "./content-queries.ts";
import { Dashboard } from "./dashboard.ts";
import { BlogId, OrganizationId, UserId } from "./domain.ts";

const actorId = UserId.make("user-1");
const organizationId = OrganizationId.make("workspace-1");
const blogId = BlogId.make("11111111-1111-4111-8111-111111111111");

function dashboardLayer(role: "admin" | "viewer", invitationReads: Array<string>) {
  const context = {
    role,
    workspace: { id: organizationId },
    publication: { id: blogId },
  } as never;
  const dependencies = Layer.mergeAll(
    Layer.mock(BlogAccess.Service, {
      dashboardContext: () => Effect.succeed(context),
      requireMembersManage: () =>
        role === "admin"
          ? Effect.succeed({} as never)
          : Effect.fail(
              new BlogAccess.WorkspaceAccessDenied({
                organizationId,
                userId: actorId,
                capability: "members:manage",
              }),
            ),
    }),
    Layer.mock(ContentQueries.Service, {
      getTeam: () => Effect.succeed({ authors: [], members: [] }),
      getPendingInvitations: () => {
        invitationReads.push(role);
        return Effect.succeed([]);
      },
    }),
    Layer.succeed(WebConfig, {
      defaultBlog: "fieldnotes",
      publicUrl: "http://localhost:3000",
      databaseUrl: Redacted.make("postgres://test"),
      authSecret: Redacted.make("test-secret-at-least-32-characters"),
      allowSignUp: false,
      smtpUrl: Option.none(),
      emailFrom: "Prosewire <prosewire@localhost>",
      environment: "test",
    }),
  );
  return Dashboard.layer.pipe(Layer.provide(dependencies));
}

describe("dashboard team privacy", () => {
  it.effect("does not load pending invitation addresses for viewers", () => {
    const invitationReads: Array<string> = [];

    return Effect.gen(function* () {
      const dashboard = yield* Dashboard.Service;
      const result = yield* dashboard.team(actorId, {});

      expect(result.invitations).toEqual([]);
      expect(invitationReads).toEqual([]);
    }).pipe(Effect.provide(dashboardLayer("viewer", invitationReads)));
  });

  it.effect("loads pending invitations for people managers", () => {
    const invitationReads: Array<string> = [];

    return Effect.gen(function* () {
      const dashboard = yield* Dashboard.Service;
      yield* dashboard.team(actorId, {});

      expect(invitationReads).toEqual(["admin"]);
    }).pipe(Effect.provide(dashboardLayer("admin", invitationReads)));
  });
});
