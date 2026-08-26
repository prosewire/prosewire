import { runMigrations, withDatabaseAdvisoryLock } from "@prosewire/db";
import { migrateWorkflowStorage } from "./workflow-storage.ts";

export interface MigrationDependencies {
  readonly runMigrations: (
    databaseUrl: string,
    migrationsDir?: string,
  ) => Promise<void>;
  readonly withDatabaseAdvisoryLock: <A>(
    databaseUrl: string,
    evaluate: () => Promise<A>,
  ) => Promise<A>;
  readonly migrateWorkflowStorage: (databaseUrl: string) => Promise<void>;
}

const defaultDependencies: MigrationDependencies = {
  runMigrations,
  withDatabaseAdvisoryLock,
  migrateWorkflowStorage,
};

export function migrateDatabase(
  databaseUrl: string,
  migrationsDir?: string,
  dependencies: MigrationDependencies = defaultDependencies,
): Promise<void> {
  return dependencies.withDatabaseAdvisoryLock(databaseUrl, async () => {
    await dependencies.runMigrations(databaseUrl, migrationsDir);
    await dependencies.migrateWorkflowStorage(databaseUrl);
  });
}
