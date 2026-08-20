import { Queue, Worker } from "bullmq";
import { Clock, Effect, Redacted } from "effect";

import {
  disposeWorkerRuntime,
  runWorkerEffect,
} from "./app-runtime.ts";
import { Publishing } from "./publishing.ts";
import { AnalyticsRetention } from "./analytics-retention.ts";
import { runUntilShutdown } from "./shutdown.ts";
import { WorkerConfig } from "./worker-config.ts";
import {
  connectionFromUrl,
  analyticsRetentionJobTemplate,
  publishingJobTemplate,
  waitForEmitterError,
  WorkerRuntimeError,
} from "./worker-runtime.ts";

const queueName = "prosewire-publishing";
const jobName = "publish-scheduled";
const analyticsJobName = "prune-analytics";

const closeResource = (
  resource: "queue" | "worker",
  close: () => Promise<void>,
): Effect.Effect<void> =>
  Effect.tryPromise({
    try: close,
    catch: (cause) =>
      new WorkerRuntimeError({
        operation: `close ${resource}`,
        cause,
      }),
  }).pipe(
    Effect.tapError((error) => Effect.logError(`Failed to close ${resource}`, error)),
    Effect.ignore,
  );

const runWorker = Effect.gen(function* () {
  const config = yield* WorkerConfig;
  const publishing = yield* Publishing.Service;
  const analyticsRetention = yield* AnalyticsRetention.Service;
  const connection = yield* Effect.try({
    try: () => connectionFromUrl(new URL(Redacted.value(config.redisUrl))),
    catch: (cause) => new WorkerRuntimeError({ operation: "configure redis", cause }),
  });

  const queue = yield* Effect.acquireRelease(
    Effect.try({
      try: () => new Queue(queueName, { connection }),
      catch: (cause) =>
        new WorkerRuntimeError({
          operation: "create publishing queue",
          cause,
        }),
    }),
    (resource) => closeResource("queue", () => resource.close()),
  );

  return yield* Effect.raceFirst(
    waitForEmitterError(queue, "queue"),
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => Promise.all([
          queue.upsertJobScheduler(
            "publish-scheduled-posts",
            { every: 30_000 },
            publishingJobTemplate(),
          ),
          queue.upsertJobScheduler(
            "prune-analytics-events",
            { every: 86_400_000 },
            analyticsRetentionJobTemplate(),
          ),
        ]),
        catch: (cause) =>
          new WorkerRuntimeError({
            operation: "schedule publishing job",
            cause,
          }),
      });

      const worker = yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            new Worker(
              queueName,
              (job) =>
                job.name === jobName
                  ? runWorkerEffect(publishing.publishScheduled())
                  : job.name === analyticsJobName
                    ? runWorkerEffect(
                        Effect.gen(function* () {
                          const now = new Date(yield* Clock.currentTimeMillis);
                          const deleted = yield* analyticsRetention.pruneExpired(now);
                          yield* Effect.logInfo(
                            `Pruned ${deleted} expired analytics event(s)`,
                          );
                        }),
                      )
                  : Promise.resolve(),
              { connection },
            ),
          catch: (cause) =>
            new WorkerRuntimeError({
              operation: "create publishing worker",
              cause,
            }),
        }),
        (resource) => closeResource("worker", () => resource.close()),
      );

      worker.on("failed", (job, cause) => {
        void runWorkerEffect(
          Effect.logError("Publishing job failed", {
            jobId: job?.id,
            cause,
          }),
        ).catch(() => undefined);
      });
      worker.on("ready", () => {
        void runWorkerEffect(
          Effect.logInfo("Publishing worker ready", { queue: queueName }),
        ).catch(() => undefined);
      });

      return yield* waitForEmitterError(worker, "worker");
    }),
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
