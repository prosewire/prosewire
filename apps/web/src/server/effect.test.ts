import { describe, expect, it } from "@effect/vitest";
import { openDb } from "@prosewire/db/client";
import {
  ConfigProvider,
  Effect,
  Fiber,
  Layer,
  ManagedRuntime,
  Redacted,
} from "effect";

import {
  disabledOrganizationMutationPaths,
  emailPasswordPolicy,
} from "./auth-service.ts";
import { WebConfig } from "./config.ts";
import { Database } from "./database.ts";
import { promiseEffect } from "./external-effect.ts";
import { SeedConfig } from "./seed-config.ts";

describe("web infrastructure", () => {
  it("keeps the signup endpoint available for the invitation-aware gate", () => {
    expect(emailPasswordPolicy.disableSignUp).toBe(false);
  });

  it("routes organization writes through the audited application service", () => {
    expect(disabledOrganizationMutationPaths).toContain(
      "/organization/invite-member",
    );
    expect(disabledOrganizationMutationPaths).toContain(
      "/organization/update-member-role",
    );
    expect(disabledOrganizationMutationPaths).toContain("/organization/create");
  });

  it("fails configuration when required production credentials are absent", async () => {
    const emptyConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({}),
    );
    const runtime = ManagedRuntime.make(
      WebConfig.layer.pipe(Layer.provide(emptyConfig)),
    );

    try {
      await expect(runtime.runPromise(WebConfig)).rejects.toThrow(
        /DATABASE_URL/,
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects insecure placeholder credentials", async () => {
    const placeholderConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        DATABASE_URL: "postgres://localhost/prosewire",
        BETTER_AUTH_SECRET:
          "replace-with-a-unique-secret-of-at-least-32-characters",
        ADMIN_PASSWORD: "replace-with-a-unique-admin-password",
      }),
    );
    const runtime = ManagedRuntime.make(
      WebConfig.layer.pipe(Layer.provide(placeholderConfig)),
    );

    try {
      await expect(runtime.runPromise(WebConfig)).rejects.toThrow(
        /BETTER_AUTH_SECRET/,
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("accepts the documented authentication secret in development", async () => {
    const developmentConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://localhost/prosewire",
        BETTER_AUTH_SECRET: "local-development-secret-change-before-production",
      }),
    );
    const runtime = ManagedRuntime.make(
      WebConfig.layer.pipe(Layer.provide(developmentConfig)),
    );

    try {
      const config = await runtime.runPromise(WebConfig);
      expect(config.environment).toBe("development");
      expect(config.deployment).toBe("self-hosted");
      expect(Redacted.value(config.authSecret)).toBe(
        "local-development-secret-change-before-production",
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("enables configured social providers only for cloud deployments", async () => {
    const cloudConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://localhost/prosewire",
        BETTER_AUTH_SECRET: "cloud-auth-secret-with-at-least-32-characters",
        PROSEWIRE_DEPLOYMENT: "cloud",
        PROSEWIRE_GOOGLE_CLIENT_ID: "google-client-id",
        PROSEWIRE_GOOGLE_CLIENT_SECRET: "google-client-secret",
      }),
    );
    const runtime = ManagedRuntime.make(
      WebConfig.layer.pipe(Layer.provide(cloudConfig)),
    );

    try {
      const config = await runtime.runPromise(WebConfig);
      expect(config.deployment).toBe("cloud");
      expect(config.cloudSocialProviders?.google?.clientId).toBe(
        "google-client-id",
      );
      expect(config.cloudSocialProviders?.github).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps social providers disabled for self-hosted deployments", async () => {
    const selfHostedConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://localhost/prosewire",
        BETTER_AUTH_SECRET:
          "self-hosted-auth-secret-with-at-least-32-characters",
        PROSEWIRE_GOOGLE_CLIENT_ID: "ignored-google-client-id",
        PROSEWIRE_GOOGLE_CLIENT_SECRET: "ignored-google-client-secret",
      }),
    );
    const runtime = ManagedRuntime.make(
      WebConfig.layer.pipe(Layer.provide(selfHostedConfig)),
    );

    try {
      const config = await runtime.runPromise(WebConfig);
      expect(config.deployment).toBe("self-hosted");
      expect(config.cloudSocialProviders).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects incomplete cloud social provider credentials", async () => {
    const incompleteConfig = Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://localhost/prosewire",
        BETTER_AUTH_SECRET: "cloud-auth-secret-with-at-least-32-characters",
        PROSEWIRE_DEPLOYMENT: "cloud",
        PROSEWIRE_GITHUB_CLIENT_ID: "github-client-id",
      }),
    );
    const runtime = ManagedRuntime.make(
      WebConfig.layer.pipe(Layer.provide(incompleteConfig)),
    );

    try {
      await expect(runtime.runPromise(WebConfig)).rejects.toThrow(
        /PROSEWIRE_GITHUB_CLIENT_SECRET/,
      );
    } finally {
      await runtime.dispose();
    }
  });

  it.each([
    "local-development-secret-change-before-production",
    "please-change-this-to-at-least-32-characters",
    "replace-with-a-unique-secret-of-at-least-32-characters",
    "replace-with-at-least-32-random-characters",
  ])(
    "rejects the known production authentication placeholder %s",
    async (authSecret) => {
      const productionConfig = Layer.succeed(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          NODE_ENV: "production",
          DATABASE_URL: "postgres://localhost/prosewire",
          BETTER_AUTH_SECRET: authSecret,
        }),
      );
      const runtime = ManagedRuntime.make(
        WebConfig.layer.pipe(Layer.provide(productionConfig)),
      );

      try {
        await expect(runtime.runPromise(WebConfig)).rejects.toThrow(
          /BETTER_AUTH_SECRET/,
        );
      } finally {
        await runtime.dispose();
      }
    },
  );

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
      await expect(runtime.runPromise(SeedConfig)).rejects.toThrow(
        /ADMIN_PASSWORD/,
      );
    } finally {
      await runtime.dispose();
    }
  });

  it.effect("preserves successful promise values", () =>
    Effect.gen(function* () {
      const result = yield* promiseEffect(
        "test.loadPost",
        () => Promise.resolve("post"),
        (cause) => cause,
      );

      expect(result).toBe("post");
    }),
  );

  it.effect("maps promise failures to the caller-owned error", () => {
    const cause = new Error("database unavailable");

    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        promiseEffect(
          "test.loadPost",
          () => Promise.reject(cause),
          (failure) => failure,
        ),
      );

      expect(error).toBe(cause);
    });
  });

  it.effect("aborts the promise signal when its fiber is interrupted", () =>
    Effect.gen(function* () {
      let receivedSignal: AbortSignal | undefined;
      const fiber = yield* Effect.forkChild(
        promiseEffect(
          "test.wait",
          (signal) => {
            receivedSignal = signal;
            return new Promise<never>(() => undefined);
          },
          (cause) => cause,
        ),
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
      allowSignUp: false,
      deployment: "self-hosted",
      environment: "test",
    });
    const database = Database.layerWith(() => {
      opened += 1;
      const resource = openDb("postgres://test");
      return {
        client: resource.client,
        close: async () => {
          closed += 1;
          await resource.close();
        },
      };
    }).pipe(Layer.provide(config));
    const runtime = ManagedRuntime.make(database);

    try {
      await runtime.runPromise(Effect.void);
      expect(opened).toBe(0);

      await runtime.runPromise(
        Effect.flatMap(Database, (service) => service.client),
      );
      expect(opened).toBe(1);
    } finally {
      await runtime.dispose();
    }

    expect(closed).toBe(1);
  });
});
