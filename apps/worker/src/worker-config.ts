import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

export class WorkerConfigurationError extends Schema.TaggedError<WorkerConfigurationError>()(
  "WorkerConfigurationError",
  {
    variable: Schema.Literals(["DATABASE_URL", "REDIS_URL"]),
    cause: Schema.Defect(),
  },
) {}

export interface WorkerConfigShape {
  readonly databaseUrl: Redacted.Redacted<string>;
  readonly redisUrl: Redacted.Redacted<string>;
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
      const redisUrl = yield* Config.redacted("REDIS_URL").pipe(
        Config.withDefault(Redacted.make("redis://localhost:6379")),
        Effect.mapError(
          (cause) =>
            new WorkerConfigurationError({ variable: "REDIS_URL", cause }),
        ),
      );
      return { databaseUrl, redisUrl };
    }),
  );
}

export * as WorkerConfiguration from "./worker-config.js";
