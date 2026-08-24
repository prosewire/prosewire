import type { Option, Redacted } from "effect";
import { Config, Context, Effect, Layer, Schema } from "effect";

export class WorkerConfigurationError extends Schema.TaggedError<WorkerConfigurationError>()(
  "WorkerConfigurationError",
  {
    variable: Schema.Literals([
      "DATABASE_URL",
      "REDIS_URL",
      "PROSEWIRE_ANALYTICS_RETENTION_DAYS",
      "PROSEWIRE_EMAIL_WORKER_CONCURRENCY",
    ]),
    cause: Schema.Defect(),
  },
) {}

export interface WorkerConfigShape {
  readonly databaseUrl: Redacted.Redacted<string>;
  readonly redisUrl: Redacted.Redacted<string>;
  readonly analyticsRetentionDays: number;
  readonly emailWorkerConcurrency: number;
  readonly smtpUrl: Option.Option<Redacted.Redacted<string>>;
  readonly emailFrom: string;
  readonly environment: string;
}

export class WorkerConfig extends Context.Service<
  WorkerConfig,
  WorkerConfigShape
>()("@prosewire/worker/WorkerConfig") {
  static readonly layer = Layer.effect(
    WorkerConfig,
    Effect.gen(function* () {
      const databaseUrl = yield* Config.redacted("DATABASE_URL").pipe(
        Effect.mapError(
          (cause) =>
            new WorkerConfigurationError({ variable: "DATABASE_URL", cause }),
        ),
      );
      const redisUrl = yield* Config.redacted("REDIS_URL").pipe(
        Effect.mapError(
          (cause) =>
            new WorkerConfigurationError({ variable: "REDIS_URL", cause }),
        ),
      );
      const analyticsRetentionDays = yield* Config.number(
        "PROSEWIRE_ANALYTICS_RETENTION_DAYS",
      ).pipe(Config.withDefault(365));
      const emailWorkerConcurrency = yield* Config.number(
        "PROSEWIRE_EMAIL_WORKER_CONCURRENCY",
      ).pipe(Config.withDefault(4));
      const smtpUrl = yield* Config.option(Config.redacted("SMTP_URL"));
      const emailFrom = yield* Config.string("EMAIL_FROM").pipe(
        Config.withDefault("Prosewire <prosewire@localhost>"),
      );
      const environment = yield* Config.string("NODE_ENV").pipe(
        Config.withDefault("development"),
      );
      if (
        !Number.isInteger(analyticsRetentionDays) ||
        analyticsRetentionDays < 1
      ) {
        return yield* new WorkerConfigurationError({
          variable: "PROSEWIRE_ANALYTICS_RETENTION_DAYS",
          cause: new Error(
            "PROSEWIRE_ANALYTICS_RETENTION_DAYS must be positive",
          ),
        });
      }
      if (
        !Number.isInteger(emailWorkerConcurrency) ||
        emailWorkerConcurrency < 1
      ) {
        return yield* new WorkerConfigurationError({
          variable: "PROSEWIRE_EMAIL_WORKER_CONCURRENCY",
          cause: new Error(
            "PROSEWIRE_EMAIL_WORKER_CONCURRENCY must be positive",
          ),
        });
      }
      return {
        databaseUrl,
        redisUrl,
        analyticsRetentionDays,
        emailWorkerConcurrency,
        smtpUrl,
        emailFrom,
        environment,
      };
    }),
  );
}

export * as WorkerConfiguration from "./worker-config.js";
