import { runMigrations, withDatabaseAdvisoryLock } from "@prosewire/db";
import { Effect, Redacted, Schema } from "effect";
import { makeBootstrapRuntime } from "./server/bootstrap-runtime.ts";
import { WebConfig } from "./server/config.ts";
import { Seed } from "./server/seed.ts";

class InstrumentationError extends Schema.TaggedError<InstrumentationError>()(
  "InstrumentationError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const attempt = <A>(
  operation: string,
  evaluate: () => PromiseLike<A>,
): Effect.Effect<A, InstrumentationError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new InstrumentationError({ operation, cause }),
  }).pipe(Effect.withSpan(`instrumentation.${operation}`));

const bootstrapEffect = Effect.fn("WebInstrumentation.bootstrap")(function* () {
  const config = yield* WebConfig;
  yield* attempt("migrate", () =>
    runMigrations(Redacted.value(config.databaseUrl)),
  );
  const seed = yield* Seed.Service;
  yield* seed.initialData();
});

export async function registerNode(): Promise<void> {
  const runtime = makeBootstrapRuntime();
  try {
    const config = await runtime.runPromise(WebConfig);
    await withDatabaseAdvisoryLock(Redacted.value(config.databaseUrl), () =>
      runtime.runPromise(bootstrapEffect()),
    );
  } finally {
    await runtime.dispose();
  }
}
