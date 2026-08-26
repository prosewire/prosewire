import { describe, expect, it } from "@effect/vitest";
import { EmailDeliveryError } from "@prosewire/jobs/email-queue";
import { Effect } from "effect";
import { type Item, make, type Queue, type Store } from "./email-outbox.ts";

const start = new Date("2026-08-25T12:00:00.000Z");
const item: Item = {
  id: "outbox-1",
  recipient: "person@example.com",
  subject: "Invitation",
  text: "Join the workspace",
  html: "<p>Join the workspace</p>",
  attempts: 0,
};

class MemoryStore implements Store {
  attempts = 0;
  availableAt = start;
  lockedAt: Date | null = null;
  lockedBy: string | null = null;
  dispatchedAt: Date | null = null;
  lastError: string | null = null;
  failNextMark = false;

  claim(
    workerId: string,
    now: Date,
    staleBefore: Date,
  ): Promise<ReadonlyArray<Item>> {
    const locked = this.lockedAt !== null && this.lockedAt >= staleBefore;
    if (this.dispatchedAt || this.availableAt > now || locked) {
      return Promise.resolve([]);
    }
    this.lockedAt = now;
    this.lockedBy = workerId;
    return Promise.resolve([{ ...item, attempts: this.attempts }]);
  }

  markDispatched(
    _id: string,
    workerId: string,
    dispatchedAt: Date,
  ): Promise<void> {
    if (this.failNextMark) {
      this.failNextMark = false;
      return Promise.reject(new Error("database connection lost"));
    }
    if (this.lockedBy !== workerId)
      return Promise.reject(new Error("lease lost"));
    this.dispatchedAt = dispatchedAt;
    this.lockedAt = null;
    this.lockedBy = null;
    return Promise.resolve();
  }

  release(
    _id: string,
    workerId: string,
    availableAt: Date,
    lastError: string,
  ): Promise<void> {
    if (this.lockedBy !== workerId)
      return Promise.reject(new Error("lease lost"));
    this.attempts += 1;
    this.availableAt = availableAt;
    this.lastError = lastError;
    this.lockedAt = null;
    this.lockedBy = null;
    return Promise.resolve();
  }
}

function deduplicatingQueue(
  offered: Array<{ readonly id: string; readonly subject: string }>,
): Queue {
  const ids = new Set<string>();
  return {
    offer: (job) =>
      Effect.sync(() => {
        if (ids.has(job.outboxId)) return;
        ids.add(job.outboxId);
        offered.push({ id: job.outboxId, subject: job.subject });
      }),
  };
}

describe("EmailOutbox", () => {
  it.effect("releases failed queue writes with exponential backoff", () => {
    const store = new MemoryStore();
    let fail = true;
    const queue: Queue = {
      offer: () => {
        if (!fail) return Effect.void;
        fail = false;
        return Effect.fail(
          new EmailDeliveryError({
            recipient: item.recipient,
            cause: new Error("Redis unavailable"),
          }),
        );
      },
    };
    const service = make(store, queue, "worker-1");

    return Effect.gen(function* () {
      expect(yield* service.dispatchPending(start)).toEqual({
        dispatched: 0,
        deferred: 1,
      });
      expect(store.attempts).toBe(1);
      expect(store.availableAt).toEqual(new Date("2026-08-25T12:00:01.000Z"));
      expect(store.lastError).toBe("Redis unavailable");

      expect(yield* service.dispatchPending(store.availableAt)).toEqual({
        dispatched: 1,
        deferred: 0,
      });
      expect(store.dispatchedAt).toEqual(store.availableAt);
    });
  });

  it.effect(
    "recovers after a worker restart without duplicating the queue job",
    () => {
      const store = new MemoryStore();
      store.failNextMark = true;
      const offered: Array<{ readonly id: string; readonly subject: string }> =
        [];
      const queue = deduplicatingQueue(offered);
      const firstWorker = make(store, queue, "worker-1", {
        leaseDurationMs: 1000,
      });
      const restartedWorker = make(store, queue, "worker-2", {
        leaseDurationMs: 1000,
      });

      return Effect.gen(function* () {
        yield* Effect.flip(firstWorker.dispatchPending(start));
        expect(offered).toHaveLength(1);
        expect(yield* restartedWorker.dispatchPending(start)).toEqual({
          dispatched: 0,
          deferred: 0,
        });

        const afterLease = new Date(start.getTime() + 1001);
        expect(yield* restartedWorker.dispatchPending(afterLease)).toEqual({
          dispatched: 1,
          deferred: 0,
        });
        expect(offered).toEqual([{ id: "outbox-1", subject: "Invitation" }]);
        expect(store.dispatchedAt).toEqual(afterLease);
      });
    },
  );

  it.effect("allows only one competing worker to claim an email", () => {
    const store = new MemoryStore();
    const offered: Array<{ readonly id: string; readonly subject: string }> =
      [];
    const queue = deduplicatingQueue(offered);
    const workerOne = make(store, queue, "worker-1");
    const workerTwo = make(store, queue, "worker-2");

    return Effect.gen(function* () {
      const results = yield* Effect.all(
        [workerOne.dispatchPending(start), workerTwo.dispatchPending(start)],
        { concurrency: "unbounded" },
      );
      expect(results.reduce((sum, result) => sum + result.dispatched, 0)).toBe(
        1,
      );
      expect(offered).toHaveLength(1);
    });
  });
});
