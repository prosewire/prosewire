import { describe, expect, it } from "@effect/vitest";
import { Cause, Duration, Effect, Exit, Fiber, Ref, Schedule } from "effect";
import { TestClock } from "effect/testing";
import {
  analyticsRetentionInterval,
  emailConsumerFailureInterval,
  emailOutboxInterval,
  publishingInterval,
  repeatScheduled,
} from "./worker-runtime.ts";

describe("Effect worker schedules", () => {
  it("uses the established publishing and retention intervals", () => {
    expect(Duration.toMillis(publishingInterval)).toBe(30_000);
    expect(Duration.toMillis(emailOutboxInterval)).toBe(5_000);
    expect(Duration.toMillis(emailConsumerFailureInterval)).toBe(1_000);
    expect(Duration.toMillis(analyticsRetentionInterval)).toBe(86_400_000);
  });

  it.effect("runs immediately and repeats without real sleeps", () =>
    Effect.gen(function* () {
      const count = yield* Ref.make(0);
      const fiber = yield* repeatScheduled(
        "test",
        Ref.update(count, (value) => value + 1),
        Schedule.spaced(publishingInterval),
      ).pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      expect(yield* Ref.get(count)).toBe(1);
      yield* TestClock.adjust(publishingInterval);
      yield* Effect.yieldNow;
      expect(yield* Ref.get(count)).toBe(2);
      yield* Fiber.interrupt(fiber);
    }),
  );

  it.effect("logs a failed cycle and continues with the next one", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const fiber = yield* repeatScheduled(
        "recovering",
        Ref.updateAndGet(attempts, (value) => value + 1).pipe(
          Effect.flatMap((attempt) =>
            attempt === 1 ? Effect.fail("first failure") : Effect.void,
          ),
        ),
        Schedule.spaced(publishingInterval),
      ).pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      yield* TestClock.adjust(publishingInterval);
      yield* Effect.yieldNow;
      expect(yield* Ref.get(attempts)).toBe(2);
      yield* Fiber.interrupt(fiber);
    }),
  );

  it.effect("lets defects reach worker supervision", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        repeatScheduled("defecting", Effect.die("boom"), Schedule.recurs(0)),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
      }
    }),
  );

  it.effect("preserves self-interruption", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        repeatScheduled("interrupting", Effect.interrupt, Schedule.recurs(0)),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      }
    }),
  );
});
