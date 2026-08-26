import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as PersistedQueue from "effect/unstable/persistence/PersistedQueue";
import {
  DurableQueue,
  Workflow,
  WorkflowEngine,
} from "effect/unstable/workflow";
import { EmailDeliveryError, EmailDeliveryJob, queue } from "./email-queue.ts";

const EmailTestWorkflow = Workflow.make("EmailTestWorkflow", {
  payload: EmailDeliveryJob,
  error: EmailDeliveryError,
  idempotencyKey: ({ outboxId }) => outboxId,
});

const infrastructureLayer = Layer.merge(
  WorkflowEngine.layerMemory,
  PersistedQueue.layer.pipe(Layer.provide(PersistedQueue.layerStoreMemory)),
);

const workflowLayer = EmailTestWorkflow.toLayer((message) =>
  DurableQueue.process(queue, message),
).pipe(Layer.provideMerge(infrastructureLayer));

const job = new EmailDeliveryJob({
  outboxId: "outbox-1",
  recipient: "person@example.com",
  subject: "Invitation",
  text: "Join the workspace",
  html: "<p>Join the workspace</p>",
});

describe("Email durable queue", () => {
  it.effect("completes the waiting workflow with a typed payload", () => {
    const delivered: Array<EmailDeliveryJob> = [];

    return Effect.gen(function* () {
      yield* DurableQueue.makeWorker(queue, (message) =>
        Effect.sync(() => {
          delivered.push(message);
        }),
      ).pipe(Effect.forkChild);

      yield* EmailTestWorkflow.execute(job);
      expect(delivered).toEqual([job]);
    }).pipe(Effect.provide(workflowLayer));
  });

  it.effect("returns a typed worker failure to the workflow", () => {
    const failure = new EmailDeliveryError({
      recipient: job.recipient,
      cause: new Error("SMTP unavailable"),
    });

    return Effect.gen(function* () {
      yield* DurableQueue.makeWorker(queue, () => Effect.fail(failure)).pipe(
        Effect.forkChild,
      );

      const error = yield* Effect.flip(EmailTestWorkflow.execute(job));
      expect(error).toEqual(failure);
    }).pipe(Effect.provide(workflowLayer));
  });

  it.effect("deduplicates concurrent executions by outbox id", () => {
    let deliveries = 0;

    return Effect.gen(function* () {
      yield* DurableQueue.makeWorker(queue, () =>
        Effect.sync(() => {
          deliveries += 1;
        }),
      ).pipe(Effect.forkChild);

      yield* Effect.all(
        [EmailTestWorkflow.execute(job), EmailTestWorkflow.execute(job)],
        { concurrency: "unbounded", discard: true },
      );
      expect(deliveries).toBe(1);
    }).pipe(Effect.provide(workflowLayer));
  });
});
