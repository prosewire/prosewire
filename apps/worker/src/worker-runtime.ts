import { Duration, Effect, Schedule } from "effect";

export const publishingInterval = Duration.seconds(30);
export const emailRetryInterval = Duration.seconds(30);
export const analyticsRetentionInterval = Duration.days(1);

export const publishingSchedule = Schedule.spaced(publishingInterval);
export const analyticsRetentionSchedule = Schedule.spaced(
  analyticsRetentionInterval,
);

/**
 * Runs once immediately, logs typed failures, and keeps scheduling subsequent
 * cycles. Defects and interruption remain visible to process supervision.
 */
export const repeatScheduled = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
  schedule: Schedule.Schedule<unknown, unknown, never, never>,
) =>
  effect.pipe(
    Effect.tapError((error) => Effect.logError(`${name} cycle failed`, error)),
    Effect.ignore,
    Effect.repeat(schedule),
  );

export * as WorkerScheduling from "./worker-runtime.js";
