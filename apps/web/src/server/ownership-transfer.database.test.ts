import * as schema from "@prosewire/db/schema";
import { openTestDatabase, type TestDatabase } from "@prosewire/db/testing";
import { eq, sql } from "drizzle-orm";
import { Effect, Layer, Result, Schema } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  configLayer,
  databaseLayer,
  databaseUrl,
} from "./database-test-support.ts";
import { MemberId, OrganizationId, UserId } from "./domain.ts";
import { PlatformCrypto } from "./platform-crypto.ts";
import {
  MemberMutationInput,
  TransferOwnershipInput,
  UpdateMemberRoleInput,
  WorkspaceRepository,
} from "./workspace-repository.ts";

const organizationId = OrganizationId.make("transfer-workspace");
const memberId = (id: string) => MemberId.make(`member-${id}`);
const actor = (id: string) => ({
  id: UserId.make(id),
  name: id,
  email: `${id}@example.com`,
  sessionId: `session-${id}`,
});
const transfer = (id = "target") =>
  new TransferOwnershipInput({
    organizationId,
    memberId: memberId(id),
    confirmed: true,
  });

describe.skipIf(!databaseUrl)("workspace ownership transfer", () => {
  let database: TestDatabase;
  let service: WorkspaceRepository.Interface;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    database = await openTestDatabase(databaseUrl, "owner_transfer");
    service = await Effect.runPromise(
      WorkspaceRepository.Service.pipe(
        Effect.provide(
          WorkspaceRepository.layer.pipe(
            Layer.provide(
              Layer.mergeAll(
                databaseLayer(database.client),
                configLayer(database.url),
                PlatformCrypto.layer,
              ),
            ),
          ),
        ),
      ),
    );
  });
  afterAll(async () => {
    await database?.close();
  });
  beforeEach(async () => {
    await database.reset();
    await database.client.insert(schema.organization).values([
      { id: organizationId, name: "Transfer team", slug: "transfer-team" },
      { id: "foreign-workspace", name: "Other team", slug: "other-team" },
    ]);
    const roles = {
      owner: "owner",
      admin: "admin",
      editor: "editor",
      author: "author",
      viewer: "viewer",
      target: "viewer",
      alternative: "editor",
      foreign: "viewer",
    };
    for (const [id, role] of Object.entries(roles)) {
      await database.client
        .insert(schema.user)
        .values({ id, name: id, email: `${id}@example.com` });
      await database.client.insert(schema.member).values({
        id: memberId(id),
        organizationId: id === "foreign" ? "foreign-workspace" : organizationId,
        userId: id,
        role,
      });
    }
  });
  const result = <A, E>(operation: Effect.Effect<A, E>) =>
    Effect.runPromise(Effect.result(operation));
  const roles = async () => {
    const rows = await database.client.query.member.findMany({
      where: eq(schema.member.organizationId, organizationId),
    });
    return Object.fromEntries(rows.map((row) => [row.userId, row.role]));
  };
  const audits = () =>
    database.client.query.auditLog.findMany({
      where: eq(schema.auditLog.action, "workspace.ownership_transferred"),
    });

  it("hands over the sole owner and commits both roles with one audit", async () => {
    await Effect.runPromise(
      service.transferOwnership(transfer(), actor("owner")),
    );
    expect(await roles()).toMatchObject({ owner: "admin", target: "owner" });
    expect(await audits()).toMatchObject([
      {
        organizationId,
        actorId: "owner",
        before: { ownerId: "owner", targetRole: "viewer" },
        after: { ownerId: "target", formerOwnerRole: "admin" },
      },
    ]);
  });
  it("rejects a repeated handover from the former owner without another audit", async () => {
    await Effect.runPromise(
      service.transferOwnership(transfer(), actor("owner")),
    );
    const outcome = await result(
      service.transferOwnership(transfer(), actor("owner")),
    );
    expect(Result.isFailure(outcome) && outcome.failure._tag).toBe(
      "WorkspaceAccessDenied",
    );
    expect(await audits()).toHaveLength(1);
    expect(await roles()).toMatchObject({ owner: "admin", target: "owner" });
  });
  it("preserves other owners", async () => {
    await database.client
      .update(schema.member)
      .set({ role: "owner" })
      .where(eq(schema.member.id, memberId("alternative")));
    await Effect.runPromise(
      service.transferOwnership(transfer(), actor("owner")),
    );
    expect(await roles()).toMatchObject({
      owner: "admin",
      target: "owner",
      alternative: "owner",
    });
  });
  it.each(["admin", "editor", "author", "viewer", "foreign", "missing"])(
    "denies %s as an actor",
    async (id) => {
      const outcome = await result(
        service.transferOwnership(transfer(), actor(id)),
      );
      expect(Result.isFailure(outcome) && outcome.failure._tag).toBe(
        "WorkspaceAccessDenied",
      );
      expect(await roles()).toMatchObject({ owner: "owner", target: "viewer" });
      expect(await audits()).toHaveLength(0);
    },
  );
  it.each(["owner", "foreign", "missing"])(
    "rejects %s as a target",
    async (id) => {
      const outcome = await result(
        service.transferOwnership(transfer(id), actor("owner")),
      );
      expect(Result.isFailure(outcome) && outcome.failure._tag).toBe(
        id === "owner" ? "ProtectedMember" : "MemberNotFound",
      );
      expect(await roles()).toMatchObject({ owner: "owner", target: "viewer" });
      expect(await audits()).toHaveLength(0);
    },
  );
  it("rejects an existing owner", async () => {
    for (const role of ["owner"]) {
      await database.client
        .update(schema.member)
        .set({ role })
        .where(eq(schema.member.id, memberId("target")));
      const outcome = await result(
        service.transferOwnership(transfer(), actor("owner")),
      );
      expect(Result.isFailure(outcome) && outcome.failure._tag).toBe(
        "ProtectedMember",
      );
    }
    expect((await roles()).owner).toBe("owner");
    expect(await audits()).toHaveLength(0);
  });
  it("requires confirmation at the boundary", () => {
    expect(
      Result.isFailure(
        Schema.decodeUnknownResult(TransferOwnershipInput)({
          ...transfer(),
          confirmed: false,
        }),
      ),
    ).toBe(true);
  });
  it("rejects a disabled target account", async () => {
    await database.client
      .update(schema.user)
      .set({ disabledAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(schema.user.id, "target"));
    const outcome = await result(
      service.transferOwnership(transfer(), actor("owner")),
    );
    expect(Result.isFailure(outcome) && outcome.failure._tag).toBe(
      "ProtectedMember",
    );
    expect(await roles()).toMatchObject({ owner: "owner", target: "viewer" });
    expect(await audits()).toHaveLength(0);
  });
  it("rolls both roles back when the required audit fails", async () => {
    await database.client.execute(
      sql`create function reject_transfer_audit() returns trigger language plpgsql as 'begin if NEW.action = ''workspace.ownership_transferred'' then raise exception ''audit unavailable''; end if; return NEW; end'`,
    );
    await database.client.execute(
      sql`create trigger reject_transfer_audit before insert on audit_log for each row execute function reject_transfer_audit()`,
    );
    try {
      const outcome = await result(
        service.transferOwnership(transfer(), actor("owner")),
      );
      expect(Result.isFailure(outcome) && outcome.failure._tag).toBe(
        "WorkspaceRepositoryPersistenceError",
      );
      expect(await roles()).toMatchObject({ owner: "owner", target: "viewer" });
      expect(await audits()).toHaveLength(0);
    } finally {
      await database.client.execute(
        sql`drop trigger reject_transfer_audit on audit_log`,
      );
      await database.client.execute(sql`drop function reject_transfer_audit()`);
    }
  });
  it("serializes two transfers and rechecks the former owner's permission", async () => {
    const outcomes = await Promise.all([
      result(service.transferOwnership(transfer(), actor("owner"))),
      result(
        service.transferOwnership(transfer("alternative"), actor("owner")),
      ),
    ]);
    expect(outcomes.filter(Result.isSuccess)).toHaveLength(1);
    expect(
      outcomes.filter(Result.isFailure).map((outcome) => outcome.failure._tag),
    ).toEqual(["WorkspaceAccessDenied"]);
    expect(
      Object.values(await roles()).filter((role) => role === "owner"),
    ).toHaveLength(1);
    expect(await audits()).toHaveLength(1);
  });
  it.each(["remove", "role"] as const)(
    "serializes transfer against member %s",
    async (mutation) => {
      const input = { organizationId, memberId: memberId("target") };
      const operation =
        mutation === "remove"
          ? service.removeMember(new MemberMutationInput(input), actor("admin"))
          : service.updateMemberRole(
              new UpdateMemberRoleInput({ ...input, role: "author" }),
              actor("admin"),
            );
      const [handover, membership] = await Promise.all([
        result(service.transferOwnership(transfer(), actor("owner"))),
        result(operation),
      ]);
      const finalRoles = await roles();
      expect(
        Object.values(finalRoles).filter((role) => role === "owner"),
      ).toHaveLength(1);
      if (Result.isSuccess(handover)) {
        expect(finalRoles.target).toBe("owner");
        if (Result.isFailure(membership)) {
          expect(membership.failure._tag).toBe("ProtectedMember");
        } else {
          // A role edit can commit before the handover; removal cannot.
          expect(mutation).toBe("role");
        }
      } else {
        expect(mutation).toBe("remove");
        expect(handover.failure._tag).toBe("MemberNotFound");
        expect(finalRoles.owner).toBe("owner");
      }
    },
  );
});
