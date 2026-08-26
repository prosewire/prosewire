import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, ManagedRuntime, Redacted } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import {
  DurableQueue,
  Workflow,
  WorkflowEngine,
} from "effect/unstable/workflow";
import * as JobQueueConfig from "./config.ts";
import { EmailDeliveryError, EmailDeliveryJob, queue } from "./email-queue.ts";
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
          expect(yield* redis.send<number>("LLEN", queueKey)).toBe(1);

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
        }),
      );
    } finally {
      await runtime.dispose();
    }
  });
});
