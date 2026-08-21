import { Clock, Effect } from "effect";
import {
  disposeWorkerRuntime,
  runWorkerEffect,
} from "./app-runtime.ts";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { EmailOutbox } from "./email-outbox.ts";
import { Publishing } from "./publishing.ts";
import { runUntilShutdown } from "./shutdown.ts";
import {
  analyticsRetentionSchedule,
  emailOutboxSchedule,
  publishingSchedule,
  repeatScheduled,
} from "./worker-runtime.ts";

const runWorker = Effect.gen(function* () {
  const publishing = yield* Publishing.Service;
  const analyticsRetention = yield* AnalyticsRetention.Service;
  const emailOutbox = yield* EmailOutbox.Service;

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
  const deliverEmail = repeatScheduled(
    "Email outbox",
    Effect.gen(function* () {
      const now = new Date(yield* Clock.currentTimeMillis);
      const summary = yield* emailOutbox.processPending(now);
      if (summary.claimed > 0) {
        yield* Effect.logInfo(
          `Processed ${summary.claimed} email(s): ${summary.sent} sent, ${summary.deferred} deferred`,
        );
      }
    }),
    emailOutboxSchedule,
  );

  yield* Effect.logInfo("Publishing worker ready", {
    scheduler: "effect",
  });
  return yield* Effect.all([publishScheduled, pruneAnalytics, deliverEmail], {
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
