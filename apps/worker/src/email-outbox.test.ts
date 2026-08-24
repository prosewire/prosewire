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
import { asc, sql } from "drizzle-orm";
import { Effect } from "effect";
import {
  EmailOutboxPersistenceError,
  type Message,
  make,
} from "./email-outbox.ts";

const databaseUrl = process.env.DATABASE_URL;
const now = new Date("2026-08-21T12:00:00.000Z");

describe.skipIf(!databaseUrl)("EmailOutbox with PostgreSQL", () => {
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

  it.effect("claims once, delivers successes, and defers failures", () => {
    const delivered: Array<Message> = [];
    const outbox = make(testDatabase.client, (message) => {
      delivered.push(message);
      if (message.recipient === "retry@example.com") {
        return Promise.reject(new Error("SMTP unavailable"));
      }
      return Promise.resolve();
    });

    return Effect.gen(function* () {
      yield* Effect.promise(() =>
        testDatabase.client.insert(schema.emailOutbox).values([
          {
            id: "11111111-1111-4111-8111-111111111111",
            recipient: "sent@example.com",
            subject: "Invitation",
            textBody: "Join the workspace",
            htmlBody: "<p>Join the workspace</p>",
            availableAt: now,
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            recipient: "retry@example.com",
            subject: "Invitation",
            textBody: "Join the workspace",
            htmlBody: "<p>Join the workspace</p>",
            availableAt: now,
          },
        ]),
      );
      const summary = yield* outbox.processPending(now);

      expect(summary).toEqual({ claimed: 2, sent: 1, deferred: 1 });
      expect(delivered.map(({ recipient }) => recipient)).toEqual([
        "sent@example.com",
        "retry@example.com",
      ]);
      const persisted = yield* Effect.promise(() =>
        testDatabase.client
          .select()
          .from(schema.emailOutbox)
          .orderBy(asc(schema.emailOutbox.recipient)),
      );
      const retry = persisted.find(
        ({ recipient }) => recipient === "retry@example.com",
      );
      const sent = persisted.find(
        ({ recipient }) => recipient === "sent@example.com",
      );
      expect(sent).toMatchObject({
        sentAt: now,
        claimedAt: null,
        lastError: null,
      });
      expect(retry).toMatchObject({
        attempts: 1,
        availableAt: new Date("2026-08-21T12:01:00.000Z"),
        claimedAt: null,
        lastError: "SMTP unavailable",
      });
    });
  });

  it.effect("exposes database failures as capability-owned errors", () => {
    const outbox = make(testDatabase.client, () => Promise.resolve());

    return Effect.gen(function* () {
      yield* Effect.promise(async () => {
        await testDatabase.client.insert(schema.emailOutbox).values({
          recipient: "person@example.com",
          subject: "Invitation",
          textBody: "Join the workspace",
          availableAt: now,
        });
        await testDatabase.client.execute(
          sql.raw(`
            create function fail_outbox_update() returns trigger
            language plpgsql as $$
            begin
              raise exception 'database unavailable';
            end;
            $$;
            create trigger fail_outbox_update_trigger
            before update on email_outbox
            for each row execute function fail_outbox_update()
          `),
        );
      });
      const error = yield* Effect.flip(outbox.processPending(now));

      expect(error).toBeInstanceOf(EmailOutboxPersistenceError);
      expect(error.operation).toBe("process pending email deliveries");
    });
  });
});
