import { EventEmitter } from "node:events";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";

import {
  connectionFromUrl,
  analyticsRetentionJobTemplate,
  publishingJobTemplate,
  type ErrorEmitter,
  waitForEmitterError,
} from "./worker-runtime.ts";

describe("worker runtime boundaries", () => {
  it.effect("turns queue error events into typed Effect failures", () =>
    Effect.gen(function* () {
      const emitter = new EventEmitter();
      const fiber = yield* Effect.forkChild(
        waitForEmitterError(emitter as ErrorEmitter, "queue"),
      );
      yield* Effect.yieldNow;

      const cause = new Error("redis disconnected");
      emitter.emit("error", cause);
      const error = yield* Effect.flip(Fiber.join(fiber));

      expect(error._tag).toBe("WorkerRuntimeError");
      expect(error.operation).toBe("queue error event");
      expect(error.cause).toBe(cause);
      expect(() => emitter.emit("error", new Error("second error"))).not.toThrow();
      emitter.removeAllListeners("error");
    }),
  );

  it("preserves authentication, database, and TLS Redis URL options", () => {
    expect(
      connectionFromUrl(new URL("rediss://worker:p%40ss@redis.example:7443/3")),
    ).toEqual({
      host: "redis.example",
      port: 7443,
      username: "worker",
      password: "p@ss",
      db: 3,
      tls: {},
    });
  });

  it("bounds publishing retries and retained job history", () => {
    expect(publishingJobTemplate()).toEqual({
      name: "publish-scheduled",
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 86_400, count: 100 },
        removeOnFail: { age: 604_800, count: 1_000 },
      },
    });
  });

  it("uses the same bounded policy for analytics retention", () => {
    expect(analyticsRetentionJobTemplate()).toMatchObject({
      name: "prune-analytics",
      opts: {
        attempts: 3,
        removeOnComplete: { age: 86_400, count: 100 },
        removeOnFail: { age: 604_800, count: 1_000 },
      },
    });
  });
});
