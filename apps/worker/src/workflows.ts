import * as EmailQueue from "@prosewire/jobs/email-queue";
import { Effect, Layer, Schedule, Schema } from "effect";
import { DurableQueue, Workflow } from "effect/unstable/workflow";
import {
  AnalyticsRetention,
  AnalyticsRetentionError,
} from "./analytics-retention.ts";
import { PublishedPost } from "./domain.ts";
import { EmailDelivery } from "./email-delivery.ts";
import { EmailOutbox, EmailOutboxDatabaseError } from "./email-outbox.ts";
import { Publishing } from "./publishing.ts";
import { PublishingDatabaseError } from "./publishing-repository.ts";
import { drainEmailOutbox } from "./worker-runtime.ts";

export const EmailDeliveryWorkflow = Workflow.make("ProsewireEmailDelivery", {
  payload: EmailQueue.EmailDeliveryJob,
  error: EmailQueue.EmailDeliveryError,
  idempotencyKey: ({ outboxId }) => outboxId,
});

export const ScheduledPublishingWorkflow = Workflow.make(
  "ProsewireScheduledPublishing",
  {
    payload: { requestedAt: Schema.String },
    success: Schema.Array(PublishedPost),
    error: PublishingDatabaseError,
    idempotencyKey: ({ requestedAt }) => requestedAt,
  },
);

export const AnalyticsRetentionWorkflow = Workflow.make(
  "ProsewireAnalyticsRetention",
  {
    payload: { requestedAt: Schema.String },
    success: Schema.Int,
    error: AnalyticsRetentionError,
    idempotencyKey: ({ requestedAt }) => requestedAt.slice(0, 10),
  },
);

export const EmailOutboxWorkflow = Workflow.make("ProsewireEmailOutbox", {
  payload: {
    requestId: Schema.String,
    requestedAt: Schema.String,
  },
  success: Schema.Struct({
    dispatched: Schema.Int,
    deferred: Schema.Int,
  }),
  error: EmailOutboxDatabaseError,
  idempotencyKey: ({ requestId }) => requestId,
});

export const handlersLayer = Layer.mergeAll(
  EmailDeliveryWorkflow.toLayer((message) =>
    DurableQueue.process(EmailQueue.queue, message),
  ),
  ScheduledPublishingWorkflow.toLayer(({ requestedAt }) =>
    Publishing.Service.pipe(
      Effect.flatMap((publishing) =>
        publishing.publishScheduled(new Date(requestedAt)),
      ),
    ),
  ),
  AnalyticsRetentionWorkflow.toLayer(({ requestedAt }) =>
    AnalyticsRetention.Service.pipe(
      Effect.flatMap((retention) =>
        retention.pruneExpired(new Date(requestedAt)),
      ),
      Effect.tap((deleted) =>
        Effect.logInfo(`Pruned ${deleted} expired analytics event(s)`),
      ),
    ),
  ),
  EmailOutboxWorkflow.toLayer(() =>
    EmailOutbox.Service.pipe(
      Effect.flatMap((outbox) => drainEmailOutbox(outbox.dispatchPending)),
      Effect.tap((result) =>
        result.dispatched > 0 || result.deferred > 0
          ? Effect.logInfo("Processed email outbox", result)
          : Effect.void,
      ),
    ),
  ),
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

export const startScheduledPublishing = (now: Date) =>
  ScheduledPublishingWorkflow.execute(
    { requestedAt: now.toISOString() },
    { discard: true },
  ).pipe(Effect.asVoid);

export const startAnalyticsRetention = (now: Date) =>
  AnalyticsRetentionWorkflow.execute(
    { requestedAt: now.toISOString() },
    { discard: true },
  ).pipe(Effect.asVoid);

export const startEmailOutbox = (now: Date) =>
  EmailOutboxWorkflow.execute(
    {
      requestId: crypto.randomUUID(),
      requestedAt: now.toISOString(),
    },
    { discard: true },
  ).pipe(Effect.asVoid);
