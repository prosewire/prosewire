import { runMigrations, withDatabaseAdvisoryLock } from "@prosewire/db";

export interface MigrationDependencies {
  readonly runMigrations: (
    databaseUrl: string,
    migrationsDir?: string,
  ) => Promise<void>;
  readonly withDatabaseAdvisoryLock: <A>(
    databaseUrl: string,
    evaluate: () => Promise<A>,
  ) => Promise<A>;
}

const defaultDependencies: MigrationDependencies = {
  runMigrations,
  withDatabaseAdvisoryLock,
};

export function migrateDatabase(
  databaseUrl: string,
  migrationsDir?: string,
  dependencies: MigrationDependencies = defaultDependencies,
): Promise<void> {
  return dependencies.withDatabaseAdvisoryLock(databaseUrl, () =>
    dependencies.runMigrations(databaseUrl, migrationsDir),
  );
}
