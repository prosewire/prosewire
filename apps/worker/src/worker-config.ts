import { Config, Context, Effect, Layer, Schema } from "effect";
import type { Redacted } from "effect";

export class WorkerConfigurationError extends Schema.TaggedError<WorkerConfigurationError>()(
  "WorkerConfigurationError",
  {
    variable: Schema.Literals([
      "DATABASE_URL",
      "PROSEWIRE_ANALYTICS_RETENTION_DAYS",
    ]),
    cause: Schema.Defect(),
  },
) {}

export interface WorkerConfigShape {
  readonly databaseUrl: Redacted.Redacted<string>;
  readonly analyticsRetentionDays: number;
}

export class WorkerConfig extends Context.Service<WorkerConfig, WorkerConfigShape>()(
  "@prosewire/worker/WorkerConfig",
) {
  static readonly layer = Layer.effect(
    WorkerConfig,
    Effect.gen(function* () {
      const databaseUrl = yield* Config.redacted("DATABASE_URL").pipe(
        Effect.mapError(
          (cause) =>
            new WorkerConfigurationError({ variable: "DATABASE_URL", cause }),
        ),
      );
      const analyticsRetentionDays = yield* Config.number(
        "PROSEWIRE_ANALYTICS_RETENTION_DAYS",
      ).pipe(Config.withDefault(365));
      if (!Number.isInteger(analyticsRetentionDays) || analyticsRetentionDays < 1) {
        return yield* new WorkerConfigurationError({
          variable: "PROSEWIRE_ANALYTICS_RETENTION_DAYS",
          cause: new Error("PROSEWIRE_ANALYTICS_RETENTION_DAYS must be positive"),
        });
      }
      return { databaseUrl, analyticsRetentionDays };
    }),
  );
}

export * as WorkerConfiguration from "./worker-config.js";
