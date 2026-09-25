import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";
import * as Config from "./config.ts";
import * as Redis from "./redis.ts";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@redis/client", () => ({ createClient: mocks.create }));

function client() {
  const resource = {
    isOpen: false,
    on: vi.fn(),
    connect: vi.fn(async () => {
      resource.isOpen = true;
    }),
    close: vi.fn(async () => {
      resource.isOpen = false;
    }),
    destroy: vi.fn(() => {
      resource.isOpen = false;
    }),
    duplicate: vi.fn(),
    subscribe: vi.fn(async () => {}),
    sendCommand: vi.fn(async () => "PONG"),
  };
  return resource;
}

const live = Redis.layer.pipe(
  Layer.provide(Config.layer(Redacted.make("redis://test"))),
);

describe("Redis resource ownership", () => {
  it.effect(
    "closes a connecting client when initialization is interrupted",
    () =>
      Effect.gen(function* () {
        const resource = client();
        resource.connect.mockImplementation(() => {
          resource.isOpen = true;
          return new Promise(() => {});
        });
        mocks.create.mockReturnValue(resource);
        const fiber = yield* Redis.Service.pipe(
          Effect.provide(live),
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(fiber);
        expect(resource.close).toHaveBeenCalledOnce();
        expect(resource.isOpen).toBe(false);
      }),
  );

  it.effect("bounds connection attempts and destroys a stalled close", () =>
    Effect.gen(function* () {
      const resource = client();
      resource.connect.mockImplementation(() => {
        resource.isOpen = true;
        return new Promise(() => {});
      });
      resource.close.mockImplementation(() => new Promise(() => {}));
      mocks.create.mockReturnValue(resource);
      const fiber = yield* Redis.Service.pipe(
        Effect.provide(live),
        Effect.exit,
        Effect.forkChild,
      );
      yield* TestClock.adjust("10 seconds");
      yield* TestClock.adjust("5 seconds");
      const exit = yield* Fiber.join(fiber);
      expect(exit._tag).toBe("Failure");
      expect(resource.destroy).toHaveBeenCalledOnce();
    }),
  );

  it.effect("closes subscriptions even when subscribe fails", () =>
    Effect.gen(function* () {
      const resource = client();
      const subscriber = client();
      subscriber.subscribe.mockRejectedValue(new Error("subscribe failed"));
      resource.duplicate.mockReturnValue(subscriber);
      mocks.create.mockReturnValue(resource);
      const result = yield* Effect.gen(function* () {
        const redis = yield* Redis.Service;
        const subscription = yield* redis.subscribe("channel", () => {});
        yield* subscription;
      }).pipe(Effect.provide(live), Effect.scoped, Effect.exit);
      expect(result._tag).toBe("Failure");
      expect(subscriber.close).toHaveBeenCalledOnce();
      expect(resource.close).toHaveBeenCalledOnce();
    }),
  );
});
