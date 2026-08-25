import * as schema from "@prosewire/db/schema";
import { openTestDatabase, type TestDatabase } from "@prosewire/db/testing";
import { emailOutboxNotificationChannel } from "@prosewire/jobs/email-queue";
import { eq, sql } from "drizzle-orm";
import { ManagedRuntime } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzleStore } from "./email-outbox.ts";
import {
  Service as EmailOutboxNotifications,
  layerWith as notificationLayerWith,
  postgresSource,
} from "./email-outbox-notifications.ts";

const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(!databaseUrl)("PostgreSQL email outbox", () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    testDatabase = await openTestDatabase(databaseUrl, "worker_email_outbox");
  });

  beforeEach(async () => {
    await testDatabase.reset();
  });

  afterAll(async () => {
    await testDatabase?.close();
  });

  it("leases an intent to only one competing worker", async () => {
    const [row] = await testDatabase.client
      .insert(schema.emailDeliveryOutbox)
      .values({
        recipient: "person@example.com",
        subject: "Invitation",
        text: "Join the workspace",
      })
      .returning({ id: schema.emailDeliveryOutbox.id });
    if (!row) throw new Error("Expected an outbox row");

    const store = drizzleStore(testDatabase.client);
    const now = new Date("2026-08-25T12:00:00.000Z");
    await testDatabase.client
      .update(schema.emailDeliveryOutbox)
      .set({ availableAt: now })
      .where(eq(schema.emailDeliveryOutbox.id, row.id));
    const [first, second] = await Promise.all([
      store.claim("worker-1", now, new Date(now.getTime() - 300_000), 25),
      store.claim("worker-2", now, new Date(now.getTime() - 300_000), 25),
    ]);

    expect([...first, ...second]).toHaveLength(1);
    expect([...first, ...second][0]?.id).toBe(row.id);
    const claimedBy = first.length === 1 ? "worker-1" : "worker-2";
    const persisted =
      await testDatabase.client.query.emailDeliveryOutbox.findFirst();
    expect(persisted?.lockedBy).toBe(claimedBy);
  });

  it("reclaims an expired lease after a worker restart", async () => {
    const lockedAt = new Date("2026-08-25T12:00:00.000Z");
    const [row] = await testDatabase.client
      .insert(schema.emailDeliveryOutbox)
      .values({
        recipient: "person@example.com",
        subject: "Invitation",
        text: "Join the workspace",
        availableAt: lockedAt,
        lockedAt,
        lockedBy: "stopped-worker",
      })
      .returning({ id: schema.emailDeliveryOutbox.id });
    if (!row) throw new Error("Expected an outbox row");

    const restartedAt = new Date(lockedAt.getTime() + 300_001);
    const claimed = await drizzleStore(testDatabase.client).claim(
      "restarted-worker",
      restartedAt,
      new Date(restartedAt.getTime() - 300_000),
      25,
    );

    expect(claimed.map(({ id }) => id)).toEqual([row.id]);
    const persisted =
      await testDatabase.client.query.emailDeliveryOutbox.findFirst();
    expect(persisted?.lockedBy).toBe("restarted-worker");
  });

  it("wakes the worker when an outbox transaction commits", async () => {
    const runtime = ManagedRuntime.make(
      notificationLayerWith(postgresSource(testDatabase.client)),
    );

    try {
      const notifications = await runtime.runPromise(EmailOutboxNotifications);
      const wakeup = runtime.runPromise(notifications.wait);

      await testDatabase.client.transaction(async (tx) => {
        await tx.insert(schema.emailDeliveryOutbox).values({
          recipient: "person@example.com",
          subject: "Invitation",
          text: "Join the workspace",
        });
        await tx.execute(
          sql`select pg_notify(${emailOutboxNotificationChannel}, '')`,
        );
      });

      await wakeup;
    } finally {
      await runtime.dispose();
    }
  });
});
