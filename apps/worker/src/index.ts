import * as JobRedis from "@prosewire/jobs/redis";
import { Clock, Effect, Option, Schedule } from "effect";
import { disposeWorkerRuntime, runWorkerEffect } from "./app-runtime.ts";
import { EmailOutboxNotifications } from "./email-outbox-notifications.ts";
import { runIdleHttpWorker } from "./idle-http.ts";
import { runUntilShutdown } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";
import {
  analyticsRetentionSchedule,
  emailOutboxSchedule,
  publishingSchedule,
  repeatScheduled,
} from "./worker-runtime.ts";
import { WorkflowRetention } from "./workflow-retention.ts";
import {
  startAnalyticsRetention,
  startEmailOutbox,
  startScheduledPublishing,
} from "./workflows.ts";

const runWorker = Effect.gen(function* () {
  const emailOutboxNotifications = yield* EmailOutboxNotifications.Service;
  const redis = yield* JobRedis.Service;
  const config = yield* WorkerConfig;
  const workflowRetention = yield* WorkflowRetention.Service;

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
    now.pipe(
      Effect.flatMap(startAnalyticsRetention),
      Effect.retry({ times: 3, schedule: Schedule.spaced("1 minute") }),
    ),
    analyticsRetentionSchedule,
  );
  const pruneWorkflowHistory = repeatScheduled(
    "Email workflow retention",
    now.pipe(Effect.flatMap(workflowRetention.pruneCompleted)),
    analyticsRetentionSchedule,
  );
  const dispatchEmailOutbox = startEmailOutbox();
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

  if (Option.isNone(config.smtpUrl)) {
    yield* Effect.logWarning(
      "Email delivery is disabled: configure SMTP_URL and restart the worker to deliver pending emails",
    );
  }
  yield* Effect.logInfo("Publishing worker ready", {
    workflows: "effect-cluster-postgres",
    queue: "effect-durable-queue-redis",
    emailConcurrency: config.emailWorkerConcurrency,
    emailEnabled: Option.isSome(config.smtpUrl),
  });
  return yield* Effect.all(
    [
      publishScheduled,
      pruneAnalytics,
      pruneWorkflowHistory,
      pollEmailOutbox,
      dispatchNotifiedEmails,
    ],
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
  if (process.argv.includes("--idle-http")) {
    await runIdleHttpWorker();
  } else
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
