import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import { BlogAccess } from "./authorization.ts";
import {
  DashboardContext,
  WorkspaceAuthorization,
} from "./authorization-models.ts";
import { WebConfig } from "./config.ts";
import { ContentQueries } from "./content-queries.ts";
import {
  testBlog,
  testMemberId,
  testWorkspace,
} from "./content-test-fixtures.ts";
import { Dashboard } from "./dashboard.ts";
import { UserId } from "./domain.ts";

const actorId = UserId.make("user-1");
const organizationId = testWorkspace.id;

function dashboardLayer(
  role: "admin" | "viewer",
  invitationReads: Array<string>,
) {
  const context = new DashboardContext({
    userId: actorId,
    role,
    workspace: testWorkspace,
    workspaces: [testWorkspace],
    publication: testBlog,
    publications: [testBlog],
    memberId: testMemberId,
  });
  const dependencies = Layer.mergeAll(
    Layer.mock(BlogAccess.Service, {
      dashboardContext: () => Effect.succeed(context),
      requireMembersManage: () =>
        role === "admin"
          ? Effect.succeed(
              new WorkspaceAuthorization({
                workspace: testWorkspace,
                memberId: testMemberId,
                role,
              }),
            )
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
      deployment: "self-hosted",
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
