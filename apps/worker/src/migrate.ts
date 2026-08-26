import { Config, Effect, Option, Redacted, Schema } from "effect";
import {
  type BootstrapAdminResult,
  bootstrapAdmin,
  loadBootstrapAdminConfig,
} from "./bootstrap-admin.ts";
import { migrateDatabase } from "./migration-runner.ts";

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
  const bootstrapConfig = yield* loadBootstrapAdminConfig;
  const migrationsDirectory = Option.getOrUndefined(migrationsDir);
  let bootstrapResult: BootstrapAdminResult | undefined;
  yield* Effect.tryPromise({
    try: () =>
      migrateDatabase(Redacted.value(databaseUrl), {
        ...(migrationsDirectory ? { migrationsDir: migrationsDirectory } : {}),
        ...(bootstrapConfig
          ? {
              afterMigrations: async () => {
                bootstrapResult = await bootstrapAdmin(
                  Redacted.value(databaseUrl),
                  bootstrapConfig,
                );
              },
            }
          : {}),
      }),
    catch: (cause) => new MigrationError({ cause }),
  });
  yield* Effect.logInfo("Prosewire database migrations are current");
  if (bootstrapResult === "created") {
    yield* Effect.logInfo("Created the self-hosted bootstrap administrator");
  } else if (bootstrapResult === "refreshed") {
    yield* Effect.logInfo(
      "Refreshed the pending self-hosted bootstrap administrator",
    );
  } else if (bootstrapResult === "skipped-existing-installation") {
    yield* Effect.logInfo(
      "Skipped administrator bootstrap because the installation already contains data",
    );
  }
});

await Effect.runPromise(program);
