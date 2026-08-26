import * as JobRedis from "@prosewire/jobs/redis";
import { Clock, Effect } from "effect";
import { disposeWorkerRuntime, runWorkerEffect } from "./app-runtime.ts";
import { EmailOutboxNotifications } from "./email-outbox-notifications.ts";
import { runUntilShutdown } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";
import {
  analyticsRetentionSchedule,
  emailOutboxSchedule,
  publishingSchedule,
  repeatScheduled,
} from "./worker-runtime.ts";
import {
  startAnalyticsRetention,
  startEmailOutbox,
  startScheduledPublishing,
} from "./workflows.ts";

const runWorker = Effect.gen(function* () {
  const emailOutboxNotifications = yield* EmailOutboxNotifications.Service;
  const redis = yield* JobRedis.Service;
  const config = yield* WorkerConfig;

  yield* redis.ping;

  const now = Clock.currentTimeMillis.pipe(
    Effect.map((millis) => new Date(millis)),
  );
  const publishScheduled = repeatScheduled(
    "Scheduled publishing",
    now.pipe(Effect.flatMap(startScheduledPublishing)),
    publishingSchedule,
  );
  const pruneAnalytics = repeatScheduled(
    "Analytics retention",
    now.pipe(Effect.flatMap(startAnalyticsRetention)),
    analyticsRetentionSchedule,
  );
  const dispatchEmailOutbox = now.pipe(Effect.flatMap(startEmailOutbox));
  const pollEmailOutbox = repeatScheduled(
    "Email outbox",
    dispatchEmailOutbox,
    emailOutboxSchedule,
  );
  const dispatchNotifiedEmails = emailOutboxNotifications.wait.pipe(
    Effect.andThen(dispatchEmailOutbox),
    Effect.tapError((error) =>
      Effect.logError("Notified email outbox dispatch failed", error),
    ),
    Effect.ignore,
    Effect.forever,
  );

  yield* Effect.logInfo("Publishing worker ready", {
    workflows: "effect-cluster-postgres",
    queue: "effect-durable-queue-redis",
    emailConcurrency: config.emailWorkerConcurrency,
  });
  return yield* Effect.all(
    [publishScheduled, pruneAnalytics, pollEmailOutbox, dispatchNotifiedEmails],
    {
      concurrency: "unbounded",
      discard: true,
    },
  );
});

const program = Effect.gen(function* () {
  yield* runUntilShutdown(runWorker);
  yield* Effect.logInfo("Publishing worker shutting down");
});

try {
  await runWorkerEffect(
    program.pipe(
      Effect.scoped,
      Effect.tapCause((cause) =>
        Effect.logError("Publishing worker stopped unexpectedly", cause),
      ),
    ),
  );
} finally {
  await disposeWorkerRuntime();
}
