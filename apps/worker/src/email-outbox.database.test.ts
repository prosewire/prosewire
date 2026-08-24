import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { type Message, make } from "./email-outbox.ts";

const databaseUrl = process.env["DATABASE_URL"];
// A historical cutoff prevents this processor from claiming normal application rows.
const now = new Date("1900-01-01T12:00:00.000Z");

function withStatementTimeout(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c statement_timeout=2000");
  return parsed.toString();
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!databaseUrl)("PostgreSQL email outbox", () => {
  it("skips locked rows, delivers successes, and defers failures", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(withStatementTimeout(databaseUrl));
    const lockedId = randomUUID();
    const sentId = randomUUID();
    const retryId = randomUUID();
    const ids = [lockedId, sentId, retryId];
    const delivered: Array<Message> = [];
    const locked = deferred();
    const release = deferred();
    let blockingTransaction: Promise<void> | undefined;

    try {
      await resource.client.insert(schema.emailOutbox).values([
        {
          id: lockedId,
          recipient: "locked@example.com",
          subject: "Locked",
          textBody: "Deliver after the lock is released",
          availableAt: now,
          createdAt: new Date("1900-01-01T11:57:00.000Z"),
        },
        {
          id: sentId,
          recipient: "sent@example.com",
          subject: "Ready",
          textBody: "Deliver now",
          availableAt: now,
          createdAt: new Date("1900-01-01T11:58:00.000Z"),
        },
        {
          id: retryId,
          recipient: "retry@example.com",
          subject: "Retry",
          textBody: "Defer after failure",
          availableAt: now,
          createdAt: new Date("1900-01-01T11:59:00.000Z"),
        },
      ]);
      blockingTransaction = resource.client.transaction(async (transaction) => {
        await transaction
          .select({ id: schema.emailOutbox.id })
          .from(schema.emailOutbox)
          .where(eq(schema.emailOutbox.id, lockedId))
          .for("update");
        locked.resolve();
        await release.promise;
      });
      await locked.promise;

      const outbox = make(resource.client, (message) => {
        delivered.push(message);
        return message.recipient === "retry@example.com"
          ? Promise.reject(new Error("SMTP unavailable"))
          : Promise.resolve();
      });
      const first = await Effect.runPromise(outbox.processPending(now));

      expect(first).toEqual({ claimed: 2, sent: 1, deferred: 1 });
      expect(delivered.map(({ recipient }) => recipient)).toEqual([
        "sent@example.com",
        "retry@example.com",
      ]);

      release.resolve();
      await blockingTransaction;
      const second = await Effect.runPromise(outbox.processPending(now));
      expect(second).toEqual({ claimed: 1, sent: 1, deferred: 0 });
      expect(delivered.map(({ recipient }) => recipient)).toEqual([
        "sent@example.com",
        "retry@example.com",
        "locked@example.com",
      ]);

      const rows = await resource.client.query.emailOutbox.findMany({
        where: inArray(schema.emailOutbox.id, ids),
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(sentId)).toMatchObject({
        sentAt: now,
        claimedAt: null,
        attempts: 0,
        lastError: null,
      });
      expect(byId.get(lockedId)).toMatchObject({
        sentAt: now,
        claimedAt: null,
        attempts: 0,
        lastError: null,
      });
      expect(byId.get(retryId)).toMatchObject({
        sentAt: null,
        claimedAt: null,
        attempts: 1,
        availableAt: new Date("1900-01-01T12:01:00.000Z"),
        lastError: "SMTP unavailable",
      });
    } finally {
      release.resolve();
      await blockingTransaction?.catch(() => undefined);
      await resource.client
        .delete(schema.emailOutbox)
        .where(inArray(schema.emailOutbox.id, ids));
      await resource.close();
    }
  });

  it("exposes a closed database as a capability-owned persistence error", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    await resource.close();

    const failure = await Effect.runPromise(
      Effect.flip(
        make(resource.client, () => Promise.resolve()).processPending(now),
      ),
    );

    expect(failure).toMatchObject({
      _tag: "EmailOutboxPersistenceError",
      operation: "process pending email deliveries",
    });
  });
});
