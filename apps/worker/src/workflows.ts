import * as EmailQueue from "@prosewire/jobs/email-queue";
import { Effect, Layer, Option, Schedule } from "effect";
import { DurableQueue, Workflow } from "effect/unstable/workflow";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { EmailDelivery, isRetryable } from "./email-delivery.ts";
import { EmailOutbox } from "./email-outbox.ts";
import { Publishing } from "./publishing.ts";
import { WorkerConfig } from "./worker-config.ts";
import { drainEmailOutbox } from "./worker-runtime.ts";
import { listWorkflowExecutions } from "./workflow-storage.ts";

export const EmailDeliveryWorkflow = Workflow.make("ProsewireEmailDelivery", {
  payload: EmailQueue.EmailDeliveryJob,
  error: EmailQueue.EmailDeliveryError,
  idempotencyKey: ({ outboxId }) => outboxId,
});

export const handlersLayer = EmailDeliveryWorkflow.toLayer((message) =>
  DurableQueue.process(EmailQueue.queue, message),
);

const emailDeliveryRetrySchedule = Schedule.min([
  Schedule.exponential("1 second", 2),
  Schedule.spaced("30 seconds"),
]);

export const emailWorkerLayer = (concurrency: number) =>
  Layer.unwrap(
    Effect.map(WorkerConfig, (config) =>
      Option.isNone(config.smtpUrl)
        ? Layer.empty
        : DurableQueue.worker(
            EmailQueue.queue,
            (message) =>
              EmailDelivery.Service.pipe(
                Effect.flatMap((delivery) => delivery.deliver(message)),
                Effect.tapError((error) =>
                  Effect.logError("Email delivery attempt failed", error),
                ),
                Effect.retry({
                  times: 5,
                  schedule: emailDeliveryRetrySchedule,
                  while: isRetryable,
                }),
                Effect.tapError((error) =>
                  Effect.logError("Email delivery permanently failed", {
                    outboxId: message.outboxId,
                    recipient: message.recipient,
                    retryable: isRetryable(error),
                    error,
                  }),
                ),
              ),
            { concurrency },
          ),
    ),
  );

export const startEmailDelivery = (message: EmailQueue.EmailDeliveryJob) =>
  EmailDeliveryWorkflow.execute(message, { discard: true }).pipe(Effect.asVoid);

/** Repair RC.115 deferred completions that raced the persisted suspended reply. */
export const resumeSuspendedEmailWorkflows = Effect.fn(
  "Worker.resumeSuspendedEmailWorkflows",
)(function* () {
  let after = "";
  let resumed = 0;
  while (true) {
    const rows = yield* listWorkflowExecutions(
      EmailDeliveryWorkflow._tag,
      after,
    );
    for (const row of rows) {
      const result = yield* EmailDeliveryWorkflow.poll(row.entity_id);
      if (Option.isSome(result) && result.value._tag === "Suspended") {
        // Replay uses the persisted deferred and queue idempotency identity,
        // so a delivered email is not sent again. Waiting runs stay suspended.
        yield* EmailDeliveryWorkflow.resume(row.entity_id);
        resumed += 1;
      }
      after = row.entity_id;
    }
    if (rows.length < 100) return resumed;
  }
});

// These scans are repeatable database operations. Await the actual work so the
// scheduler observes failures, and avoid persisting an execution for every poll.
export const startScheduledPublishing = Effect.fn("Worker.publishScheduled")(
  function* (now: Date) {
    const publishing = yield* Publishing.Service;
    return yield* publishing.publishScheduled(now);
  },
);

export const startAnalyticsRetention = Effect.fn("Worker.pruneAnalytics")(
  function* (now: Date) {
    const retention = yield* AnalyticsRetention.Service;
    const deleted = yield* retention.pruneExpired(now);
    yield* Effect.logInfo(`Pruned ${deleted} expired analytics event(s)`);
    return deleted;
  },
);

export const startEmailOutbox = Effect.fn("Worker.dispatchEmailOutbox")(
  function* () {
    const config = yield* WorkerConfig;
    if (Option.isNone(config.smtpUrl)) {
      return { dispatched: 0, deferred: 0 };
    }
    const outbox = yield* EmailOutbox.Service;
    const result = yield* drainEmailOutbox(outbox.dispatchPending);
    if (result.dispatched > 0 || result.deferred > 0) {
      yield* Effect.logInfo("Processed email outbox", result);
    }
    return result;
  },
);
