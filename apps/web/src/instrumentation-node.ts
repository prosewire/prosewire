import { Effect, Redacted, Schema } from "effect";
import { runMigrations } from "@prosewire/db";
import { disposeAppRuntime, runAppEffect } from "./server/app-runtime.ts";
import { WebConfig } from "./server/config.ts";
import { installRuntimeCleanup } from "./server/runtime-cleanup.ts";
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

const registerNodeEffect = Effect.fn("WebInstrumentation.registerNode")(function* () {
  const config = yield* WebConfig;
  yield* attempt("migrate", () => runMigrations(Redacted.value(config.databaseUrl)));
  const seed = yield* Seed.Service;
  yield* seed.initialData();
});

let cleanupRegistered = false;

function registerRuntimeCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  installRuntimeCleanup(
    process,
    disposeAppRuntime,
    (message, error) => {
      process.stderr.write(`${message}: ${String(error)}\n`);
    },
  );
}

export async function registerNode(): Promise<void> {
  registerRuntimeCleanup();
  try {
    await runAppEffect(registerNodeEffect());
  } catch (error) {
    await disposeAppRuntime();
    throw error;
  }
}
