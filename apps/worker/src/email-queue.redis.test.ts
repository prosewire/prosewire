import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Redacted } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import { EmailOutboxId } from "./domain.ts";
import { EmailQueue } from "./email-queue.ts";
import { WorkerRedis } from "./redis.ts";
import { WorkerConfig } from "./worker-config.ts";

const redisUrl = process.env["REDIS_URL"];

describe.skipIf(!redisUrl)("EmailQueue Redis integration", () => {
  it.live("delivers and acknowledges a job through the Redis store", () => {
    if (!redisUrl) return Effect.die("REDIS_URL is required");
    const prefix = `{prosewire-worker-test}:${crypto.randomUUID()}:effectq:`;
    const configLayer = Layer.succeed(WorkerConfig, {
      databaseUrl: Redacted.make("postgres://test"),
      redisUrl: Redacted.make(redisUrl),
      analyticsRetentionDays: 365,
      emailWorkerConcurrency: 1,
      smtpUrl: Option.none(),
      emailFrom: "Prosewire <prosewire@localhost>",
      environment: "test",
    });
    const redisLayer = WorkerRedis.layer.pipe(Layer.provideMerge(configLayer));
    const persistenceRedisLayer = WorkerRedis.persistenceLayer.pipe(
      Layer.provideMerge(redisLayer),
    );
    const storeLayer = PersistedQueue.layerStoreRedis({ prefix }).pipe(
      Layer.provideMerge(persistenceRedisLayer),
    );
    const factoryLayer = PersistedQueue.layer.pipe(
      Layer.provideMerge(storeLayer),
    );
    const queueLayer = EmailQueue.layer.pipe(Layer.provideMerge(factoryLayer));
    const runtimeLayer = Layer.mergeAll(redisLayer, queueLayer);

    return Effect.gen(function* () {
      const queue = yield* EmailQueue.Service;
      const redis = yield* WorkerRedis.Service;
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
      expect(
        yield* redis.send<number>("LLEN", `${prefix}prosewire-email-v1`),
      ).toBe(0);
      expect(
        yield* redis.send<number>(
          "HLEN",
          `${prefix}prosewire-email-v1:pending`,
        ),
      ).toBe(0);
    }).pipe(Effect.provide(runtimeLayer));
  });
});
