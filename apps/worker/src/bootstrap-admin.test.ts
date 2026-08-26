import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Redacted, Result } from "effect";
import { loadBootstrapAdminConfig } from "./bootstrap-admin.ts";

const configLayer = (values: Record<string, string>) =>
  Layer.succeed(
    ConfigProvider.ConfigProvider,
    ConfigProvider.fromUnknown(values),
  );

describe("bootstrap administrator configuration", () => {
  it.effect("is disabled when neither credential exists", () =>
    Effect.gen(function* () {
      expect(yield* loadBootstrapAdminConfig).toBeUndefined();
    }).pipe(Effect.provide(configLayer({}))),
  );

  it.effect("loads a self-hosted credential pair", () =>
    Effect.gen(function* () {
      const config = yield* loadBootstrapAdminConfig;
      expect(config).toBeDefined();
      expect(config?.email).toBe("owner@example.com");
      expect(config?.name).toBe("Prosewire Admin");
      expect(config && Redacted.value(config.password)).toBe(
        "temporary-password-123",
      );
    }).pipe(
      Effect.provide(
        configLayer({
          PROSEWIRE_BOOTSTRAP_ADMIN_EMAIL: " Owner@Example.com ",
          PROSEWIRE_BOOTSTRAP_ADMIN_PASSWORD: "temporary-password-123",
        }),
      ),
    ),
  );

  it.effect("rejects incomplete credentials and cloud bootstrap", () =>
    Effect.gen(function* () {
      const incomplete = yield* Effect.result(
        loadBootstrapAdminConfig.pipe(
          Effect.provide(
            configLayer({
              PROSEWIRE_BOOTSTRAP_ADMIN_EMAIL: "owner@example.com",
            }),
          ),
        ),
      );
      const cloud = yield* Effect.result(
        loadBootstrapAdminConfig.pipe(
          Effect.provide(
            configLayer({
              PROSEWIRE_DEPLOYMENT: "cloud",
              PROSEWIRE_BOOTSTRAP_ADMIN_EMAIL: "owner@example.com",
              PROSEWIRE_BOOTSTRAP_ADMIN_PASSWORD: "temporary-password-123",
            }),
          ),
        ),
      );

      expect(Result.isFailure(incomplete)).toBe(true);
      expect(Result.isFailure(cloud)).toBe(true);
    }),
  );
});
