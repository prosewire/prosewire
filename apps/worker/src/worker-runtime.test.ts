import { EventEmitter } from "node:events";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";

import {
  connectionFromUrl,
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
});
