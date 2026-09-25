import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, ManagedRuntime, Redacted } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import {
  DurableQueue,
  Workflow,
  WorkflowEngine,
} from "effect/unstable/workflow";
import * as JobQueueConfig from "./config.ts";
import {
  EmailDeliveryError,
  EmailDeliveryJob,
  forgetCompleted,
  migrateLegacyIdentities,
  queue,
} from "./email-queue.ts";
import * as JobRedis from "./redis.ts";

const redisUrl = process.env["REDIS_URL"];

const EmailRedisTestWorkflow = Workflow.make("EmailRedisTestWorkflow", {
  payload: EmailDeliveryJob,
  error: EmailDeliveryError,
  idempotencyKey: ({ outboxId }) => outboxId,
});

describe.skipIf(!redisUrl)("Email durable queue Redis integration", () => {
  it("persists one job and completes its waiting workflow", async () => {
    if (!redisUrl) throw new Error("REDIS_URL is required");
    const prefix = `{prosewire-jobs-test}:${crypto.randomUUID()}:effectq:`;
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
    const infrastructureLayer = Layer.mergeAll(
      redisLayer,
      factoryLayer,
      WorkflowEngine.layerMemory,
    );
    const workflowLayer = EmailRedisTestWorkflow.toLayer((message) =>
      DurableQueue.process(queue, message),
    ).pipe(Layer.provideMerge(infrastructureLayer));
    const runtime = ManagedRuntime.make(workflowLayer);
    const job = new EmailDeliveryJob({
      outboxId: "outbox-1",
      recipient: "person@example.com",
      subject: "Invitation",
      text: "Join the workspace",
      html: "<p>Join the workspace</p>",
    });

    try {
      await runtime.runPromise(
        Effect.gen(function* () {
          const workflowFiber = yield* EmailRedisTestWorkflow.execute(job).pipe(
            Effect.forkChild,
          );
          yield* Effect.sleep("50 millis");

          const redis = yield* JobRedis.Service;
          const queueKey = `${prefix}DurableQueue/prosewire-email-v2`;
          const legacyPrefix = `${prefix}legacy:`;
          const legacyKey = `${legacyPrefix}DurableQueue/${queue.name}:ids`;
          const legacyIds = Array.from(
            { length: 5000 },
            (_, i) => `legacy-${i}`,
          );
          const legacyQueue = `${legacyPrefix}DurableQueue/${queue.name}`;
          yield* redis.send("SADD", legacyKey, ...legacyIds);
          yield* redis.send("RPUSH", legacyQueue, "pending legacy payload");
          // Resume a migration whose first batch was committed before shutdown.
          const [cursor, batch] = yield* redis.send<[string, string[]]>(
            "SSCAN",
            legacyKey,
            "0",
            "COUNT",
            "100",
          );
          expect(cursor).not.toBe("0");
          yield* redis.send(
            "ZADD",
            `${legacyKey}:migrating`,
            ...batch.flatMap((id) => ["0", id]),
          );
          yield* redis.send("SET", `${legacyKey}:cursor`, cursor);
          yield* migrateLegacyIdentities(legacyPrefix);
          yield* migrateLegacyIdentities(legacyPrefix);
          expect(yield* redis.send("TYPE", legacyKey)).toBe("zset");
          expect(yield* redis.send("ZCARD", legacyKey)).toBe(legacyIds.length);
          expect(yield* redis.send("LRANGE", legacyQueue, "0", "-1")).toEqual([
            "pending legacy payload",
          ]);
          expect(
            yield* redis.send(
              "EXISTS",
              `${legacyKey}:migrating`,
              `${legacyKey}:cursor`,
            ),
          ).toBe(0);
          yield* redis.send("DEL", legacyKey, legacyQueue);
          expect(yield* redis.send<number>("LLEN", queueKey)).toBe(1);

          const executionId = yield* EmailRedisTestWorkflow.executionId(job);
          expect(
            yield* forgetCompleted(executionId, job.outboxId, prefix),
          ).toBe(false);
          expect(yield* redis.send<number>("ZCARD", `${queueKey}:ids`)).toBe(1);
          let delivered: EmailDeliveryJob | undefined;
          yield* DurableQueue.makeWorker(queue, (message) =>
            Effect.sync(() => {
              delivered = message;
            }),
          ).pipe(Effect.forkChild);
          yield* Fiber.join(workflowFiber);

          expect(delivered).toEqual(job);
          expect(yield* redis.send<number>("LLEN", queueKey)).toBe(0);
          expect(yield* redis.send<number>("HLEN", `${queueKey}:pending`)).toBe(
            0,
          );
          expect(
            yield* forgetCompleted(executionId, job.outboxId, prefix),
          ).toBe(true);
          expect(yield* redis.send<number>("ZCARD", `${queueKey}:ids`)).toBe(0);
          expect(
            yield* forgetCompleted(executionId, job.outboxId, prefix),
          ).toBe(true);
        }),
      );
    } finally {
      await runtime.dispose();
    }
  });
});
