import { Config, Effect, Option, Redacted, Schema } from "effect";
import { runMigrations } from "@prosewire/db";

class MigrationError extends Schema.TaggedError<MigrationError>()(
  "MigrationError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Unable to migrate the Prosewire database";
  }
}

const program = Effect.gen(function* () {
  const databaseUrl = yield* Config.redacted("DATABASE_URL");
  const migrationsDir = yield* Config.option(
    Config.string("PROSEWIRE_MIGRATIONS_DIR"),
  );
  yield* Effect.tryPromise({
    try: () =>
      runMigrations(
        Redacted.value(databaseUrl),
        Option.getOrUndefined(migrationsDir),
      ),
    catch: (cause) => new MigrationError({ cause }),
  });
  yield* Effect.logInfo("Prosewire database migrations are current");
});

await Effect.runPromise(program);
