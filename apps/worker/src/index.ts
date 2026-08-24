import * as JobRedis from "@prosewire/jobs/redis";
import { Clock, Effect } from "effect";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { disposeWorkerRuntime, runWorkerEffect } from "./app-runtime.ts";
import { EmailDelivery } from "./email-delivery.ts";
import { Publishing } from "./publishing.ts";
import { runUntilShutdown } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";
import {
  analyticsRetentionSchedule,
  emailRetryInterval,
  publishingSchedule,
  repeatScheduled,
} from "./worker-runtime.ts";

const runWorker = Effect.gen(function* () {
  const publishing = yield* Publishing.Service;
  const analyticsRetention = yield* AnalyticsRetention.Service;
  const emailDelivery = yield* EmailDelivery.Service;
  const redis = yield* JobRedis.Service;
  const config = yield* WorkerConfig;

  yield* redis.ping;

  const publishScheduled = repeatScheduled(
    "Scheduled publishing",
    publishing.publishScheduled(),
    publishingSchedule,
  );
  const pruneAnalytics = repeatScheduled(
    "Analytics retention",
    Effect.gen(function* () {
      const now = new Date(yield* Clock.currentTimeMillis);
      const deleted = yield* analyticsRetention.pruneExpired(now);
      yield* Effect.logInfo(`Pruned ${deleted} expired analytics event(s)`);
    }),
    analyticsRetentionSchedule,
  );
  const consumeEmail = (consumer: number) =>
    emailDelivery.processNext.pipe(
      Effect.tapError((error) =>
        Effect.logError("Email queue consumer failed", { consumer, error }),
      ),
      Effect.catch(() => Effect.sleep(emailRetryInterval)),
      Effect.forever,
    );
  const consumeEmails = Effect.all(
    Array.from({ length: config.emailWorkerConcurrency }, (_, consumer) =>
      consumeEmail(consumer + 1),
    ),
    { concurrency: "unbounded", discard: true },
  );

  yield* Effect.logInfo("Publishing worker ready", {
    queue: "effect-persisted-redis",
    emailConcurrency: config.emailWorkerConcurrency,
  });
  return yield* Effect.all([publishScheduled, pruneAnalytics, consumeEmails], {
    concurrency: "unbounded",
    discard: true,
  });
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
