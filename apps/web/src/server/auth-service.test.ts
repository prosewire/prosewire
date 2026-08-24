import * as schema from "@prosewire/db/schema";
import { openTestDatabase, type TestDatabase } from "@prosewire/db/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  makeRegistrationInvitationLookup,
  type RegistrationInvitationLookup,
  requireRegistrationInvitation,
} from "./auth-service.ts";

const databaseUrl = process.env.DATABASE_URL;

function invitationLookup(
  hasPending: RegistrationInvitationLookup["hasPending"],
): RegistrationInvitationLookup {
  return { hasPending };
}

describe("invitation-gated registration", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("allows explicitly open registration without an invitation lookup", async () => {
    const hasPending = vi.fn();

    await expect(
      requireRegistrationInvitation(invitationLookup(hasPending), {
        allowSignUp: true,
        email: "person@example.com",
        invitationId: null,
        now,
      }),
    ).resolves.toBeUndefined();
    expect(hasPending).not.toHaveBeenCalled();
  });

  it("rejects a direct signup that only knows an invited email address", async () => {
    const hasPending = vi.fn();

    await expect(
      requireRegistrationInvitation(invitationLookup(hasPending), {
        allowSignUp: false,
        email: "person@example.com",
        invitationId: null,
        now,
      }),
    ).rejects.toThrow("Registration requires a workspace invitation");
    expect(hasPending).not.toHaveBeenCalled();
  });

  it("rejects an invalid, canceled, or expired invitation token", async () => {
    const hasPending = vi.fn().mockResolvedValue(false);

    await expect(
      requireRegistrationInvitation(invitationLookup(hasPending), {
        allowSignUp: false,
        email: "person@example.com",
        invitationId: "wrong-invitation",
        now,
      }),
    ).rejects.toThrow("Registration requires a workspace invitation");
  });

  it("requires the token, normalized email, pending status, and future expiry", async () => {
    const hasPending = vi.fn().mockResolvedValue(true);

    await expect(
      requireRegistrationInvitation(invitationLookup(hasPending), {
        allowSignUp: false,
        email: "Person@Example.com",
        invitationId: "invite-1",
        now,
      }),
    ).resolves.toBeUndefined();

    expect(hasPending).toHaveBeenCalledWith({
      invitationId: "invite-1",
      email: "person@example.com",
      now,
    });
  });
});

describe.skipIf(!databaseUrl)(
  "registration invitation lookup with PostgreSQL",
  () => {
    let testDatabase: TestDatabase;
    const now = new Date("2026-08-20T12:00:00.000Z");

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("DATABASE_URL is required");
      testDatabase = await openTestDatabase(databaseUrl, "web_auth_invitation");
    });

    beforeEach(async () => {
      await testDatabase.reset();
      await testDatabase.client.insert(schema.user).values({
        id: "inviter-1",
        email: "inviter@example.com",
        name: "Inviter",
      });
      await testDatabase.client.insert(schema.organization).values({
        id: "workspace-1",
        name: "Prosewire",
        slug: "prosewire",
      });
    });

    afterAll(async () => {
      await testDatabase?.close();
    });

    it("matches the invitation id, normalized email, pending status, and expiry", async () => {
      await testDatabase.client.insert(schema.invitation).values([
        {
          id: "pending-invite",
          organizationId: "workspace-1",
          email: "person@example.com",
          role: "author",
          status: "pending",
          inviterId: "inviter-1",
          expiresAt: new Date("2026-08-21T12:00:00.000Z"),
        },
        {
          id: "canceled-invite",
          organizationId: "workspace-1",
          email: "other@example.com",
          role: "author",
          status: "canceled",
          inviterId: "inviter-1",
          expiresAt: new Date("2026-08-21T12:00:00.000Z"),
        },
        {
          id: "expired-invite",
          organizationId: "workspace-1",
          email: "expired@example.com",
          role: "author",
          status: "pending",
          inviterId: "inviter-1",
          expiresAt: new Date("2026-08-19T12:00:00.000Z"),
        },
      ]);
      const lookup = makeRegistrationInvitationLookup(testDatabase.client);

      await expect(
        lookup.hasPending({
          invitationId: "pending-invite",
          email: "person@example.com",
          now,
        }),
      ).resolves.toBe(true);
      await expect(
        lookup.hasPending({
          invitationId: "pending-invite",
          email: "wrong@example.com",
          now,
        }),
      ).resolves.toBe(false);
      await expect(
        lookup.hasPending({
          invitationId: "canceled-invite",
          email: "other@example.com",
          now,
        }),
      ).resolves.toBe(false);
      await expect(
        lookup.hasPending({
          invitationId: "expired-invite",
          email: "expired@example.com",
          now,
        }),
      ).resolves.toBe(false);
    });
  },
);
