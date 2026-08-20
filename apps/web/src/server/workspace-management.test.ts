import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Redacted } from "effect";
import type { Db } from "@prosewire/db/client";
import * as databaseSchema from "@prosewire/db/schema";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { Database, DatabaseError } from "./database.ts";
import {
  InvitationId,
  OrganizationId,
  UserId,
} from "./domain.ts";
import { PlatformCrypto } from "./platform-crypto.ts";
import { TransactionalEmail } from "./transactional-email.ts";
import {
  InviteMemberInput,
  InvitationMutationInput,
  WorkspaceManagement,
} from "./workspace-management.ts";

const organizationId = OrganizationId.make("workspace-1");
const invitationId = InvitationId.make("invitation-1");
const actor = {
  id: UserId.make("user-1"),
  name: "Invited person",
  email: "person@example.com",
  sessionId: "session-1",
};
const input = new InvitationMutationInput({ invitationId });

function workspaceAuthorizationRow(name = "Workspace") {
  return {
    workspace: {
      id: organizationId,
      name,
      slug: "studio",
      logo: null,
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    memberId: "member-1",
    role: "owner",
  };
}

function dependencies(
  client: Db,
  options: {
    readonly workspaceName?: string;
    readonly send?: (
      message: TransactionalEmail.Message,
    ) => Effect.Effect<undefined, TransactionalEmail.EmailDeliveryError>;
  } = {},
) {
  return Layer.mergeAll(
    Layer.succeed(Database, {
      client: Effect.succeed(client),
      execute: (operation, evaluate) =>
        Effect.tryPromise({
          try: () => evaluate(client),
          catch: (cause) => new DatabaseError({ operation, cause }),
        }),
    }),
    Layer.mock(BlogAccess.Service, {
      requireMembersManage: () =>
        Effect.succeed({
          workspace: {
            id: organizationId,
            name: options.workspaceName ?? "Workspace",
          },
        } as never),
    }),
    Layer.mock(TransactionalEmail.Service, {
      send: options.send ?? (() => Effect.sync(() => undefined)),
    }),
    PlatformCrypto.layer,
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
}

function invitationClient(events: Array<string>, initiallyPending: boolean): Db {
  let pending = initiallyPending;
  const transaction = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            for: () => Promise.resolve([workspaceAuthorizationRow()]),
          }),
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: { status?: string }) => ({
        where: () => {
          if (table === databaseSchema.invitation) {
            return {
              returning: () => {
                if (!pending) return Promise.resolve([]);
                pending = false;
                events.push(`claim:${values.status}`);
                return Promise.resolve([
                  {
                    organizationId,
                    email: actor.email,
                    role: "editor",
                  },
                ]);
              },
            };
          }
          events.push("session");
          return Promise.resolve();
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: () => {
        if (table === databaseSchema.member) {
          return {
            onConflictDoNothing: () => {
              events.push("member");
              return Promise.resolve();
            },
          };
        }
        events.push("audit");
        return Promise.resolve();
      },
    }),
  };
  return {
    transaction: (evaluate: (tx: typeof transaction) => Promise<unknown>) =>
      evaluate(transaction),
    query: {
      blog: {
        findFirst: () => {
          events.push("publication");
          return Promise.resolve(undefined);
        },
      },
    },
  } as unknown as Db;
}

describe("workspace invitation transitions", () => {
  it.effect("serializes invite creation and escapes untrusted email HTML", () => {
    const events: Array<string> = [];
    let delivered: TransactionalEmail.Message | undefined;
    const transaction = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              for: () =>
                Promise.resolve([
                  workspaceAuthorizationRow("Studio & Partners"),
                ]),
            }),
          }),
        }),
      }),
      execute: () => {
        events.push("lock");
        return Promise.resolve();
      },
      update: () => ({
        set: () => ({
          where: () => {
            events.push("cancel-existing");
            return Promise.resolve();
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: () => {
          events.push(
            table === databaseSchema.invitation ? "invitation" : "audit",
          );
          return Promise.resolve();
        },
      }),
    };
    const client = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: () => Promise.resolve([]) }),
        }),
      }),
      transaction: (evaluate: (tx: typeof transaction) => Promise<unknown>) =>
        evaluate(transaction),
    } as unknown as Db;
    const maliciousActor = { ...actor, name: "A <script>alert(1)</script>" };

    return Effect.gen(function* () {
      const management = yield* WorkspaceManagement.Service;
      yield* management.inviteMember(
        new InviteMemberInput({
          organizationId,
          email: "new@example.com",
          role: "viewer",
        }),
        maliciousActor,
      );

      expect(events).toEqual([
        "lock",
        "cancel-existing",
        "invitation",
        "audit",
      ]);
      expect(delivered?.html).toContain(
        "A &lt;script&gt;alert(1)&lt;/script&gt;",
      );
      expect(delivered?.html).toContain("Studio &amp; Partners");
      expect(delivered?.html).not.toContain("<script>");
    }).pipe(
      Effect.provide(
        WorkspaceManagement.layer.pipe(
          Layer.provide(
            dependencies(client, {
              workspaceName: "Studio & Partners",
              send: (message) => {
                delivered = message;
                return Effect.sync(() => undefined);
              },
            }),
          ),
        ),
      ),
    );
  });

  it.effect("does no membership, session, or audit writes after a lost accept claim", () => {
    const events: Array<string> = [];
    const client = invitationClient(events, false);

    return Effect.gen(function* () {
      const management = yield* WorkspaceManagement.Service;
      const error = yield* Effect.flip(
        management.acceptInvitation(input, actor),
      );

      expect(error._tag).toBe("InvitationNotFound");
      expect(events).toEqual([]);
    }).pipe(
      Effect.provide(
        WorkspaceManagement.layer.pipe(Layer.provide(dependencies(client))),
      ),
    );
  });

  it.effect("allows only one concurrent accept transition for a pending invitation", () => {
    const events: Array<string> = [];
    const client = invitationClient(events, true);

    return Effect.gen(function* () {
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
      expect(events).toEqual([
        "claim:accepted",
        "member",
        "session",
        "audit",
        "publication",
      ]);
    }).pipe(
      Effect.provide(
        WorkspaceManagement.layer.pipe(Layer.provide(dependencies(client))),
      ),
    );
  });

  it.effect("does not audit a cancellation that lost the pending-row claim", () => {
    const events: Array<string> = [];
    const client = invitationClient(events, false);

    return Effect.gen(function* () {
      const management = yield* WorkspaceManagement.Service;
      const error = yield* Effect.flip(
        management.cancelInvitation(organizationId, input, actor),
      );

      expect(error._tag).toBe("InvitationNotFound");
      expect(events).toEqual([]);
    }).pipe(
      Effect.provide(
        WorkspaceManagement.layer.pipe(Layer.provide(dependencies(client))),
      ),
    );
  });

  it.effect("does not mutate after authorization is lost before the transaction", () => {
    let writes = 0;
    const transaction = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              for: () => Promise.resolve([]),
            }),
          }),
        }),
      }),
      update: () => {
        writes += 1;
        throw new Error("unauthorized transactions must not write");
      },
    };
    const client = {
      transaction: (evaluate: (tx: typeof transaction) => Promise<unknown>) =>
        evaluate(transaction),
    } as unknown as Db;

    return Effect.gen(function* () {
      const management = yield* WorkspaceManagement.Service;
      const error = yield* Effect.flip(
        management.cancelInvitation(organizationId, input, actor),
      );

      expect(error).toBeInstanceOf(BlogAccess.WorkspaceAccessDenied);
      expect(writes).toBe(0);
    }).pipe(
      Effect.provide(
        WorkspaceManagement.layer.pipe(Layer.provide(dependencies(client))),
      ),
    );
  });
});
