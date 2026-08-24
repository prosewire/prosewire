import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import * as EmailQueue from "./email-queue.ts";
import { EmailDeliveryJob } from "./email-queue.ts";

const queueLayer = EmailQueue.layer.pipe(
  Layer.provide(
    PersistedQueue.layer.pipe(Layer.provide(PersistedQueue.layerStoreMemory)),
  ),
);

const job = new EmailDeliveryJob({
  recipient: "person@example.com",
  subject: "Invitation",
  text: "Join the workspace",
  html: "<p>Join the workspace</p>",
});

describe("EmailQueue", () => {
  it.effect("encodes and delivers a complete typed email payload", () =>
    Effect.gen(function* () {
      const queue = yield* EmailQueue.Service;
      let taken: EmailDeliveryJob | undefined;

      yield* queue.offer(job);
      yield* queue.take((message) =>
        Effect.sync(() => {
          taken = message;
        }),
      );

      expect(taken).toEqual(job);
    }).pipe(Effect.provide(queueLayer)),
  );

  it.effect("preserves errors raised by the delivery handler", () =>
    Effect.gen(function* () {
      const queue = yield* EmailQueue.Service;
      const failure = new Error("SMTP unavailable");

      yield* queue.offer(job);
      const error = yield* Effect.flip(queue.take(() => Effect.fail(failure)));

      expect(error).toBe(failure);
    }).pipe(Effect.provide(queueLayer)),
  );
});
