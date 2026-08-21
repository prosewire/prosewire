import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Db } from "@prosewire/db/client";
import {
  EmailOutboxPersistenceError,
  make,
  type Message,
} from "./email-outbox.ts";

const now = new Date("2026-08-21T12:00:00.000Z");

function row(id: string, recipient: string) {
  return {
    id,
    recipient,
    subject: "Invitation",
    textBody: "Join the workspace",
    htmlBody: "<p>Join the workspace</p>",
    attempts: 0,
    availableAt: now,
    claimedAt: null,
    sentAt: null,
    lastError: null,
    createdAt: now,
  };
}

describe("EmailOutbox", () => {
  it.effect("claims once, delivers successes, and defers failures", () => {
    const rows = [row("email-1", "sent@example.com"), row("email-2", "retry@example.com")];
    const updates: Array<Record<string, unknown>> = [];
    const delivered: Array<Message> = [];
    const update = () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push(values);
          return Promise.resolve();
        },
      }),
    });
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                for: () => Promise.resolve(rows),
              }),
            }),
          }),
        }),
      }),
      update,
    };
    const db = {
      transaction: async (
        evaluate: (tx: typeof transaction) => Promise<unknown>,
      ) => await evaluate(transaction),
      update,
    } as unknown as Db;
    const outbox = make(db, (message) => {
      delivered.push(message);
      if (message.recipient === "retry@example.com") {
        return Promise.reject(new Error("SMTP unavailable"));
      }
      return Promise.resolve();
    });

    return Effect.gen(function* () {
      const summary = yield* outbox.processPending(now);

      expect(summary).toEqual({ claimed: 2, sent: 1, deferred: 1 });
      expect(delivered.map(({ recipient }) => recipient)).toEqual([
        "sent@example.com",
        "retry@example.com",
      ]);
      expect(updates[0]).toEqual({ claimedAt: now });
      expect(updates[1]).toMatchObject({
        sentAt: now,
        claimedAt: null,
        lastError: null,
      });
      expect(updates[2]).toMatchObject({
        attempts: 1,
        availableAt: new Date("2026-08-21T12:01:00.000Z"),
        claimedAt: null,
        lastError: "SMTP unavailable",
      });
    });
  });

  it.effect("exposes database failures as capability-owned errors", () => {
    const db = {
      transaction: () => Promise.reject(new Error("database unavailable")),
    } as unknown as Db;

    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        make(db, () => Promise.resolve()).processPending(now),
      );

      expect(error).toBeInstanceOf(EmailOutboxPersistenceError);
      expect(error.operation).toBe("process pending email deliveries");
    });
  });
});
