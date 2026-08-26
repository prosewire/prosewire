import { Clock, Duration, Effect, Schedule } from "effect";
import type { DispatchResult } from "./email-outbox.ts";

export const publishingInterval = Duration.seconds(30);
export const emailOutboxInterval = Duration.seconds(30);
export const analyticsRetentionInterval = Duration.days(1);

export const publishingSchedule = Schedule.spaced(publishingInterval);
export const emailOutboxSchedule = Schedule.spaced(emailOutboxInterval);
export const analyticsRetentionSchedule = Schedule.spaced(
  analyticsRetentionInterval,
);

export const drainEmailOutbox = <E, R>(
  dispatchPending: (now: Date) => Effect.Effect<DispatchResult, E, R>,
): Effect.Effect<DispatchResult, E, R> =>
  Effect.gen(function* () {
    let dispatched = 0;
    let deferred = 0;

    while (true) {
      const now = new Date(yield* Clock.currentTimeMillis);
      const result = yield* dispatchPending(now);
      dispatched += result.dispatched;
      deferred += result.deferred;
      if (result.dispatched + result.deferred === 0) break;
    }

    return { dispatched, deferred };
  });

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
