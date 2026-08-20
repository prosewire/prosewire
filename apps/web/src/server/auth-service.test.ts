import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@prosewire/db/client";
import { requireRegistrationInvitation } from "./auth-service.ts";

function registrationDatabase(
  findFirst: ReturnType<typeof vi.fn>,
): Db {
  return {
    query: { invitation: { findFirst } },
  } as unknown as Db;
}

describe("invitation-gated registration", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("allows explicitly open registration without an invitation lookup", async () => {
    const findFirst = vi.fn();

    await expect(
      requireRegistrationInvitation(registrationDatabase(findFirst), {
        allowSignUp: true,
        email: "person@example.com",
        invitationId: null,
        now,
      }),
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects a direct signup that only knows an invited email address", async () => {
    const findFirst = vi.fn();

    await expect(
      requireRegistrationInvitation(registrationDatabase(findFirst), {
        allowSignUp: false,
        email: "person@example.com",
        invitationId: null,
        now,
      }),
    ).rejects.toThrow("Registration requires a workspace invitation");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid, canceled, or expired invitation token", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined);

    await expect(
      requireRegistrationInvitation(registrationDatabase(findFirst), {
        allowSignUp: false,
        email: "person@example.com",
        invitationId: "wrong-invitation",
        now,
      }),
    ).rejects.toThrow("Registration requires a workspace invitation");
  });

  it("requires the token, normalized email, pending status, and future expiry", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "invite-1" });

    await expect(
      requireRegistrationInvitation(registrationDatabase(findFirst), {
        allowSignUp: false,
        email: "Person@Example.com",
        invitationId: "invite-1",
        now,
      }),
    ).resolves.toBeUndefined();

    const options = findFirst.mock.calls[0]?.[0] as
      | { where?: Parameters<PgDialect["sqlToQuery"]>[0] }
      | undefined;
    if (!options?.where) throw new Error("Expected an invitation predicate");
    const query = new PgDialect().sqlToQuery(options.where);
    expect(query.params).toEqual([
      "invite-1",
      "person@example.com",
      "pending",
      now.toISOString(),
    ]);
  });
});
