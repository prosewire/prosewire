import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@effect/vitest";
import * as schema from "@prosewire/db/schema";
import { openTestDatabase, type TestDatabase } from "@prosewire/db/testing";
import { and, eq, sql } from "drizzle-orm";
import { Effect, Layer, Redacted, Result } from "effect";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { databaseLayer } from "./database-test-support.ts";
import { InvitationId, OrganizationId, UserId } from "./domain.ts";
import { PlatformCrypto } from "./platform-crypto.ts";
import {
  CreateWorkspaceInput,
  InvitationMutationInput,
  InviteMemberInput,
  WorkspaceManagement,
} from "./workspace-management.ts";

const databaseUrl = process.env.DATABASE_URL;
const organizationId = OrganizationId.make("workspace-1");
const invitationId = InvitationId.make("invitation-1");
const actor = {
  id: UserId.make("user-1"),
  name: "Invited person",
  email: "person@example.com",
  sessionId: "session-1",
};
const input = new InvitationMutationInput({ invitationId });

describe.skipIf(!databaseUrl)(
  "workspace invitation transitions with PostgreSQL",
  () => {
    let testDatabase: TestDatabase;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("DATABASE_URL is required");
      testDatabase = await openTestDatabase(databaseUrl, "web_workspace");
    });

    beforeEach(async () => {
      await testDatabase.reset();
    });

    afterAll(async () => {
      await testDatabase?.close();
    });

    const seedWorkspace = async (
      options: { readonly actorIsOwner?: boolean; readonly name?: string } = {},
    ) => {
      await testDatabase.client.insert(schema.user).values([
        {
          id: actor.id,
          email: actor.email,
          name: actor.name,
        },
        {
          id: "inviter-1",
          email: "inviter@example.com",
          name: "Inviter",
        },
      ]);
      await testDatabase.client.insert(schema.organization).values({
        id: organizationId,
        name: options.name ?? "Workspace",
        slug: "studio",
      });
      await testDatabase.client.insert(schema.session).values({
        id: actor.sessionId,
        userId: actor.id,
        token: "session-token",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      });
      if (options.actorIsOwner) {
        await testDatabase.client.insert(schema.member).values({
          id: "member-1",
          organizationId,
          userId: actor.id,
          role: "owner",
        });
      }
    };

    const seedInvitation = async () => {
      await testDatabase.client.insert(schema.invitation).values({
        id: invitationId,
        organizationId,
        email: actor.email,
        role: "editor",
        inviterId: "inviter-1",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      });
    };

    const layer = () =>
      WorkspaceManagement.live.pipe(
        Layer.provide(
          Layer.mergeAll(
            databaseLayer(testDatabase.client),
            Layer.mock(BlogAccess.Service, {}),
            PlatformCrypto.layer,
            Layer.succeed(WebConfig, {
              defaultBlog: "fieldnotes",
              publicUrl: "http://localhost:3000",
              databaseUrl: Redacted.make(testDatabase.url),
              authSecret: Redacted.make("test-secret-at-least-32-characters"),
              allowSignUp: false,
              deployment: "self-hosted",
              environment: "test",
            }),
          ),
        ),
      );

    it.effect("detects self-hosted installation data", () =>
      Effect.gen(function* () {
        const management = yield* WorkspaceManagement.Service;

        expect(yield* management.hasWorkspace()).toBe(false);
        expect(yield* management.hasInstallation()).toBe(false);

        yield* Effect.promise(() =>
          testDatabase.client.insert(schema.organization).values({
            id: organizationId,
            name: "Existing workspace",
            slug: "existing-workspace",
          }),
        );
        expect(yield* management.hasWorkspace()).toBe(true);
        expect(yield* management.hasInstallation()).toBe(true);

        yield* Effect.promise(async () => {
          await testDatabase.client
            .delete(schema.organization)
            .where(eq(schema.organization.id, organizationId));
          await testDatabase.client.insert(schema.user).values({
            id: actor.id,
            email: actor.email,
            name: actor.name,
          });
        });
        expect(yield* management.hasWorkspace()).toBe(false);
        expect(yield* management.hasInstallation()).toBe(true);
      }).pipe(Effect.provide(layer())),
    );

    it.effect("allows only one concurrent self-hosted bootstrap", () =>
      Effect.gen(function* () {
        const secondActor = {
          id: UserId.make("user-2"),
          name: "Second owner",
          email: "second@example.com",
          sessionId: "session-2",
        };
        yield* Effect.promise(() =>
          testDatabase.client.insert(schema.user).values([
            { id: actor.id, email: actor.email, name: actor.name },
            {
              id: secondActor.id,
              email: secondActor.email,
              name: secondActor.name,
            },
          ]),
        );
        yield* Effect.promise(() =>
          testDatabase.client.insert(schema.session).values([
            {
              id: actor.sessionId,
              userId: actor.id,
              token: "session-token-1",
              expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            },
            {
              id: secondActor.sessionId,
              userId: secondActor.id,
              token: "session-token-2",
              expiresAt: new Date("2099-01-01T00:00:00.000Z"),
            },
          ]),
        );
        const management = yield* WorkspaceManagement.Service;
        const attempts = yield* Effect.all(
          [
            management.createWorkspace(
              new CreateWorkspaceInput({
                workspaceName: "First publication",
                workspaceSlug: "first-publication",
                publicationName: "First publication",
                publicationSlug: "first-publication",
              }),
              actor,
            ),
            management.createWorkspace(
              new CreateWorkspaceInput({
                workspaceName: "Second publication",
                workspaceSlug: "second-publication",
                publicationName: "Second publication",
                publicationSlug: "second-publication",
              }),
              secondActor,
            ),
          ].map(Effect.result),
          { concurrency: "unbounded" },
        );

        expect(attempts.filter(Result.isSuccess)).toHaveLength(1);
        const failure = attempts.find(Result.isFailure);
        expect(
          failure && Result.isFailure(failure) && failure.failure,
        ).toMatchObject({ _tag: "SelfHostedWorkspaceAlreadyExists" });
        const [workspaces, publications, memberships] = yield* Effect.promise(
          () =>
            Promise.all([
              testDatabase.client.query.organization.findMany(),
              testDatabase.client.query.blog.findMany(),
              testDatabase.client.query.member.findMany(),
            ]),
        );
        expect(workspaces).toHaveLength(1);
        expect(publications).toHaveLength(1);
        expect(memberships).toHaveLength(1);
      }).pipe(Effect.provide(layer())),
    );

    it.effect(
      "serializes invite creation and escapes untrusted email HTML",
      () => {
        return Effect.gen(function* () {
          yield* Effect.promise(() =>
            seedWorkspace({ actorIsOwner: true, name: "Studio & Partners" }),
          );
          const maliciousActor = {
            ...actor,
            name: "A <script>alert(1)</script>",
          };
          const management = yield* WorkspaceManagement.Service;
          const invitationIds = yield* Effect.all(
            [
              management.inviteMember(
                new InviteMemberInput({
                  organizationId,
                  email: "new@example.com",
                  role: "viewer",
                }),
                maliciousActor,
              ),
              management.inviteMember(
                new InviteMemberInput({
                  organizationId,
                  email: "new@example.com",
                  role: "viewer",
                }),
                maliciousActor,
              ),
            ],
            { concurrency: "unbounded" },
          );

          const invitations = yield* Effect.promise(() =>
            testDatabase.client.query.invitation.findMany({
              where: eq(schema.invitation.email, "new@example.com"),
            }),
          );
          expect(invitations).toHaveLength(2);
          expect(
            invitations.filter(({ status }) => status === "pending"),
          ).toHaveLength(1);
          expect(
            invitations.filter(({ status }) => status === "canceled"),
          ).toHaveLength(1);
          const outbox = yield* Effect.promise(() =>
            testDatabase.client.query.emailDeliveryOutbox.findMany(),
          );
          expect(outbox).toHaveLength(2);
          expect(outbox.map(({ id }) => id).sort()).toEqual(
            [...invitationIds].sort(),
          );
          for (const message of outbox) {
            expect(message.html).toContain(
              "A &lt;script&gt;alert(1)&lt;/script&gt;",
            );
            expect(message.html).toContain("Studio &amp; Partners");
            expect(message.html).not.toContain("<script>");
          }
        }).pipe(Effect.provide(layer()));
      },
    );

    it.effect(
      "rolls back the invitation and audit when its outbox intent cannot persist",
      () =>
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await seedWorkspace({ actorIsOwner: true });
            await testDatabase.client.execute(
              sql`alter table ${schema.emailDeliveryOutbox} add constraint email_delivery_outbox_test_reject check (${schema.emailDeliveryOutbox.recipient} <> 'rollback@example.com')`,
            );
          });
          const management = yield* WorkspaceManagement.Service;

          const error = yield* Effect.flip(
            management.inviteMember(
              new InviteMemberInput({
                organizationId,
                email: "rollback@example.com",
                role: "viewer",
              }),
              actor,
            ),
          );
          expect(error._tag).toBe("WorkspaceRepositoryPersistenceError");

          const invitations = yield* Effect.promise(() =>
            testDatabase.client.query.invitation.findMany({
              where: eq(schema.invitation.email, "rollback@example.com"),
            }),
          );
          const audits = yield* Effect.promise(() =>
            testDatabase.client.query.auditLog.findMany({
              where: and(
                eq(schema.auditLog.organizationId, organizationId),
                eq(schema.auditLog.action, "invitation.created"),
              ),
            }),
          );
          const outbox = yield* Effect.promise(() =>
            testDatabase.client.query.emailDeliveryOutbox.findMany(),
          );
          expect(invitations).toHaveLength(0);
          expect(audits).toHaveLength(0);
          expect(outbox).toHaveLength(0);
        }).pipe(Effect.provide(layer())),
    );

    it.effect(
      "does no membership, session, or audit writes after a lost accept claim",
      () =>
        Effect.gen(function* () {
          yield* Effect.promise(() => seedWorkspace());
          const management = yield* WorkspaceManagement.Service;
          const error = yield* Effect.flip(
            management.acceptInvitation(input, actor),
          );

          expect(error._tag).toBe("InvitationNotFound");
          const members = yield* Effect.promise(() =>
            testDatabase.client.query.member.findMany(),
          );
          const session = yield* Effect.promise(() =>
            testDatabase.client.query.session.findFirst({
              where: eq(schema.session.id, actor.sessionId),
            }),
          );
          const audits = yield* Effect.promise(() =>
            testDatabase.client.query.auditLog.findMany(),
          );
          expect(members).toHaveLength(0);
          expect(session?.activeOrganizationId).toBeNull();
          expect(audits).toHaveLength(0);
        }).pipe(Effect.provide(layer())),
    );

    it.effect(
      "allows only one concurrent accept transition for a pending invitation",
      () =>
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await seedWorkspace();
            await seedInvitation();
          });
          const management = yield* WorkspaceManagement.Service;
          const outcomes = yield* Effect.all(
            [
              management.acceptInvitation(input, actor),
              management.acceptInvitation(input, actor),
            ].map((attempt) =>
              attempt.pipe(
                Effect.match({
                  onFailure: (error) => error._tag,
                  onSuccess: () => "accepted" as const,
                }),
              ),
            ),
            { concurrency: "unbounded" },
          );

          expect([...outcomes].sort()).toEqual(
            ["InvitationNotFound", "accepted"].sort(),
          );
          const members = yield* Effect.promise(() =>
            testDatabase.client.query.member.findMany(),
          );
          const session = yield* Effect.promise(() =>
            testDatabase.client.query.session.findFirst({
              where: eq(schema.session.id, actor.sessionId),
            }),
          );
          const audits = yield* Effect.promise(() =>
            testDatabase.client.query.auditLog.findMany(),
          );
          expect(members).toHaveLength(1);
          expect(members[0]?.role).toBe("editor");
          expect(session?.activeOrganizationId).toBe(organizationId);
          expect(audits).toHaveLength(1);
          expect(audits[0]?.action).toBe("invitation.accepted");
        }).pipe(Effect.provide(layer())),
    );

    it.effect(
      "does not audit a cancellation that lost the pending-row claim",
      () =>
        Effect.gen(function* () {
          yield* Effect.promise(() => seedWorkspace({ actorIsOwner: true }));
          const management = yield* WorkspaceManagement.Service;
          const error = yield* Effect.flip(
            management.cancelInvitation(organizationId, input, actor),
          );

          expect(error._tag).toBe("InvitationNotFound");
          const audits = yield* Effect.promise(() =>
            testDatabase.client.query.auditLog.findMany(),
          );
          expect(audits).toHaveLength(0);
        }).pipe(Effect.provide(layer())),
    );

    it.effect(
      "does not mutate after authorization is lost before the transaction",
      () =>
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await seedWorkspace();
            await seedInvitation();
          });
          const management = yield* WorkspaceManagement.Service;
          const error = yield* Effect.flip(
            management.cancelInvitation(organizationId, input, actor),
          );

          expect(error).toBeInstanceOf(BlogAccess.WorkspaceAccessDenied);
          const invitation = yield* Effect.promise(() =>
            testDatabase.client.query.invitation.findFirst({
              where: eq(schema.invitation.id, invitationId),
            }),
          );
          const audits = yield* Effect.promise(() =>
            testDatabase.client.query.auditLog.findMany(),
          );
          expect(invitation?.status).toBe("pending");
          expect(audits).toHaveLength(0);
        }).pipe(Effect.provide(layer())),
    );
  },
);
