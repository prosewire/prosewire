import { Duration, Effect, Schedule } from "effect";

export const publishingInterval = Duration.seconds(30);
export const emailOutboxInterval = Duration.seconds(30);
export const analyticsRetentionInterval = Duration.days(1);

export const publishingSchedule = Schedule.spaced(publishingInterval);
export const emailOutboxSchedule = Schedule.spaced(emailOutboxInterval);
export const analyticsRetentionSchedule = Schedule.spaced(
  analyticsRetentionInterval,
);

/**
 * Runs once immediately, logs a failed cycle, and keeps scheduling subsequent
 * cycles. Interruption remains observable so process shutdown is prompt.
 */
export const repeatScheduled = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
  schedule: Schedule.Schedule<unknown, unknown, never, never>,
) =>
  effect.pipe(
    Effect.tapCause((cause) =>
      Effect.logError(`${name} cycle failed`, cause),
    ),
    Effect.catchCause(() => Effect.void),
    Effect.repeat(schedule),
  );

export * as WorkerScheduling from "./worker-runtime.js";
