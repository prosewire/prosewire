import * as EmailQueue from "@prosewire/jobs/email-queue";
import { Effect, Schedule } from "effect";
import { DurableQueue, Workflow } from "effect/unstable/workflow";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { EmailDelivery } from "./email-delivery.ts";
import { EmailOutbox } from "./email-outbox.ts";
import { Publishing } from "./publishing.ts";
import { drainEmailOutbox } from "./worker-runtime.ts";

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
  Schedule.spaced("5 minutes"),
]);

export const emailWorkerLayer = (concurrency: number) =>
  DurableQueue.worker(
    EmailQueue.queue,
    (message) =>
      EmailDelivery.Service.pipe(
        Effect.flatMap((delivery) => delivery.deliver(message)),
        Effect.tapError((error) =>
          Effect.logError("Email delivery attempt failed", error),
        ),
        Effect.retry({ times: 99, schedule: emailDeliveryRetrySchedule }),
      ),
    { concurrency },
  );

export const startEmailDelivery = (message: EmailQueue.EmailDeliveryJob) =>
  EmailDeliveryWorkflow.execute(message, { discard: true }).pipe(Effect.asVoid);

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
    const outbox = yield* EmailOutbox.Service;
    const result = yield* drainEmailOutbox(outbox.dispatchPending);
    if (result.dispatched > 0 || result.deferred > 0) {
      yield* Effect.logInfo("Processed email outbox", result);
    }
    return result;
  },
);
