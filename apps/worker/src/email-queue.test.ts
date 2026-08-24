import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import { EmailOutboxId } from "./domain.ts";
import { EmailQueue } from "./email-queue.ts";

const queueLayer = EmailQueue.layer.pipe(
  Layer.provide(
    PersistedQueue.layer.pipe(Layer.provide(PersistedQueue.layerStoreMemory)),
  ),
);

describe("EmailQueue", () => {
  it.effect("encodes and delivers a typed outbox identifier", () =>
    Effect.gen(function* () {
      const queue = yield* EmailQueue.Service;
      const outboxId = EmailOutboxId.make(
        "11111111-1111-4111-8111-111111111111",
      );
      let taken: EmailOutboxId | undefined;

      yield* queue.offer(outboxId);
      yield* queue.take((job) =>
        Effect.sync(() => {
          taken = job.outboxId;
        }),
      );

      expect(taken).toBe(outboxId);
    }).pipe(Effect.provide(queueLayer)),
  );

  it.effect("preserves errors raised by the delivery handler", () =>
    Effect.gen(function* () {
      const queue = yield* EmailQueue.Service;
      const outboxId = EmailOutboxId.make(
        "11111111-1111-4111-8111-111111111111",
      );
      const failure = new Error("database unavailable");

      yield* queue.offer(outboxId);
      const error = yield* Effect.flip(queue.take(() => Effect.fail(failure)));

      expect(error).toBe(failure);
    }).pipe(Effect.provide(queueLayer)),
  );
});
