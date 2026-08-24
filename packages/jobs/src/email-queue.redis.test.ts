import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import * as JobQueueConfig from "./config.ts";
import * as EmailQueue from "./email-queue.ts";
import { EmailDeliveryJob } from "./email-queue.ts";
import * as JobRedis from "./redis.ts";

const redisUrl = process.env["REDIS_URL"];

describe.skipIf(!redisUrl)("EmailQueue Redis integration", () => {
  it("shares jobs between independent producer and consumer runtimes", async () => {
    if (!redisUrl) throw new Error("REDIS_URL is required");
    const prefix = `{prosewire-jobs-test}:${crypto.randomUUID()}:effectq:`;
    const makeRuntime = () => {
      const configLayer = JobQueueConfig.layer(Redacted.make(redisUrl));
      const redisLayer = JobRedis.layer.pipe(Layer.provideMerge(configLayer));
      const persistenceLayer = JobRedis.persistenceLayer.pipe(
        Layer.provideMerge(redisLayer),
      );
      const storeLayer = PersistedQueue.layerStoreRedis({ prefix }).pipe(
        Layer.provideMerge(persistenceLayer),
      );
      const factoryLayer = PersistedQueue.layer.pipe(
        Layer.provideMerge(storeLayer),
      );
      const queueLayer = EmailQueue.layer.pipe(
        Layer.provideMerge(factoryLayer),
      );
      return ManagedRuntime.make(Layer.mergeAll(redisLayer, queueLayer));
    };
    const producer = makeRuntime();
    const consumer = makeRuntime();
    const job = new EmailDeliveryJob({
      recipient: "person@example.com",
      subject: "Invitation",
      text: "Join the workspace",
      html: "<p>Join the workspace</p>",
    });

    try {
      await producer.runPromise(
        Effect.gen(function* () {
          const queue = yield* EmailQueue.Service;
          yield* queue.offer(job);
        }),
      );
      let taken: EmailDeliveryJob | undefined;
      await consumer.runPromise(
        Effect.gen(function* () {
          const queue = yield* EmailQueue.Service;
          yield* queue.take((message) =>
            Effect.sync(() => {
              taken = message;
            }),
          );
        }),
      );
      expect(taken).toEqual(job);
      expect(
        await consumer.runPromise(
          Effect.gen(function* () {
            const redis = yield* JobRedis.Service;
            return yield* redis.send<number>(
              "LLEN",
              `${prefix}prosewire-email-v1`,
            );
          }),
        ),
      ).toBe(0);
      expect(
        await consumer.runPromise(
          Effect.gen(function* () {
            const redis = yield* JobRedis.Service;
            return yield* redis.send<number>(
              "HLEN",
              `${prefix}prosewire-email-v1:pending`,
            );
          }),
        ),
      ).toBe(0);
    } finally {
      await Promise.all([producer.dispose(), consumer.dispose()]);
    }
  });
});
