import { describe, expect, it } from "@effect/vitest";
import {
  ConfigProvider,
  Effect,
  Fiber,
  Layer,
  ManagedRuntime,
  Redacted,
} from "effect";
import type { Db } from "@prosewire/db/client";

import { emailPasswordPolicy } from "./auth-service.ts";
import { WebConfig } from "./config.ts";
import { Database } from "./database.ts";
import { promiseEffect } from "./external-effect.ts";
import { SeedConfig } from "./seed-config.ts";

describe("web infrastructure", () => {
  it("disables public email/password signup", () => {
    expect(emailPasswordPolicy.disableSignUp).toBe(true);
  });

  it("fails configuration when required production credentials are absent", async () => {
    const emptyConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({}),
    );
    const runtime = ManagedRuntime.make(WebConfig.layer.pipe(Layer.provide(emptyConfig)));

    try {
      await expect(runtime.runPromise(WebConfig)).rejects.toThrow(/DATABASE_URL/);
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects insecure placeholder credentials", async () => {
    const placeholderConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        DATABASE_URL: "postgres://localhost/prosewire",
        BETTER_AUTH_SECRET: "replace-with-a-unique-secret-of-at-least-32-characters",
        ADMIN_PASSWORD: "replace-with-a-unique-admin-password",
      }),
    );
    const runtime = ManagedRuntime.make(
      WebConfig.layer.pipe(Layer.provide(placeholderConfig)),
    );

    try {
      await expect(runtime.runPromise(WebConfig)).rejects.toThrow(/BETTER_AUTH_SECRET/);
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects insecure bootstrap credentials", async () => {
    const placeholderConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        ADMIN_PASSWORD: "replace-with-a-unique-admin-password",
      }),
    );
    const runtime = ManagedRuntime.make(
      SeedConfig.layer.pipe(Layer.provide(placeholderConfig)),
    );

    try {
      await expect(runtime.runPromise(SeedConfig)).rejects.toThrow(/ADMIN_PASSWORD/);
    } finally {
      await runtime.dispose();
    }
  });

  it.effect("preserves successful promise values", () =>
    Effect.gen(function* () {
      const result = yield* promiseEffect("test", "load post", () => Promise.resolve("post"));

      expect(result).toBe("post");
    }),
  );

  it.effect("maps promise failures to a typed external service error", () => {
    const cause = new Error("database unavailable");

    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        promiseEffect("test", "load post", () => Promise.reject(cause)),
      );

      expect(error._tag).toBe("ExternalServiceError");
      expect(error.service).toBe("test");
      expect(error.operation).toBe("load post");
      expect(error.cause).toBe(cause);
    });
  });

  it.effect("aborts the promise signal when its fiber is interrupted", () =>
    Effect.gen(function* () {
      let receivedSignal: AbortSignal | undefined;
      const fiber = yield* Effect.forkChild(
        promiseEffect("test", "wait", (signal) => {
          receivedSignal = signal;
          return new Promise<never>(() => undefined);
        }),
      );

      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);

      expect(receivedSignal?.aborted).toBe(true);
    }),
  );

  it("opens the database lazily and closes it with the managed runtime", async () => {
    let opened = 0;
    let closed = 0;
    const config = Layer.succeed(WebConfig, {
      defaultBlog: "fieldnotes",
      publicUrl: "http://localhost:3000",
      databaseUrl: Redacted.make("postgres://test"),
      authSecret: Redacted.make("test-secret-at-least-32-characters"),
    });
    const database = Database.layerWith(() => {
      opened += 1;
      return {
        client: {} as Db,
        close: () => {
          closed += 1;
          return Promise.resolve();
        },
      };
    }).pipe(Layer.provide(config));
    const runtime = ManagedRuntime.make(database);

    try {
      await runtime.runPromise(Effect.void);
      expect(opened).toBe(0);

      await runtime.runPromise(Effect.flatMap(Database, (service) => service.client));
      expect(opened).toBe(1);
    } finally {
      await runtime.dispose();
    }

    expect(closed).toBe(1);
  });
});
