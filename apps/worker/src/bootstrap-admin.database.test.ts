import * as schema from "@prosewire/db/schema";
import { openTestDatabase, type TestDatabase } from "@prosewire/db/testing";
import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { Redacted } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bootstrapAdmin } from "./bootstrap-admin.ts";

const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(!databaseUrl)("self-hosted bootstrap administrator", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    database = await openTestDatabase(databaseUrl, "bootstrap_admin");
  });

  beforeEach(async () => {
    await database.reset();
  });

  afterAll(async () => {
    await database?.close();
  });

  it("creates one forced-change credential and refreshes it only before setup", async () => {
    const first = await bootstrapAdmin(database.url, {
      email: "owner@example.com",
      name: "Initial owner",
      password: Redacted.make("temporary-password-123"),
    });
    expect(first).toBe("created");

    const user = await database.client.query.user.findFirst();
    const account = await database.client.query.account.findFirst();
    expect(user).toMatchObject({
      email: "owner@example.com",
      emailVerified: true,
      mustChangePassword: true,
      name: "Initial owner",
      role: "admin",
    });
    expect(account?.password).toBeTruthy();
    expect(
      account?.password &&
        (await verifyPassword({
          hash: account.password,
          password: "temporary-password-123",
        })),
    ).toBe(true);

    const refreshed = await bootstrapAdmin(database.url, {
      email: "owner@example.com",
      name: "Recovered owner",
      password: Redacted.make("recovered-password-456"),
    });
    expect(refreshed).toBe("refreshed");
    const refreshedAccount = await database.client.query.account.findFirst();
    expect(
      refreshedAccount?.password &&
        (await verifyPassword({
          hash: refreshedAccount.password,
          password: "recovered-password-456",
        })),
    ).toBe(true);

    if (!user) throw new Error("Expected the bootstrap user");
    await database.client
      .update(schema.user)
      .set({ mustChangePassword: false })
      .where(eq(schema.user.id, user.id));
    const skipped = await bootstrapAdmin(database.url, {
      email: "owner@example.com",
      name: "Should not replace",
      password: Redacted.make("replacement-password-789"),
    });
    expect(skipped).toBe("skipped-existing-installation");
    const finalAccount = await database.client.query.account.findFirst();
    expect(
      finalAccount?.password &&
        (await verifyPassword({
          hash: finalAccount.password,
          password: "replacement-password-789",
        })),
    ).toBe(false);
  });

  it("does not create an administrator in an existing installation", async () => {
    await database.client.insert(schema.organization).values({
      id: "workspace-1",
      name: "Existing team",
      slug: "existing-team",
    });

    await expect(
      bootstrapAdmin(database.url, {
        email: "owner@example.com",
        name: "Initial owner",
        password: Redacted.make("temporary-password-123"),
      }),
    ).resolves.toBe("skipped-existing-installation");
    expect(await database.client.query.user.findMany()).toHaveLength(0);
  });
});
