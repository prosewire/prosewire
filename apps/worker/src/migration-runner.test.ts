import { describe, expect, it } from "vitest";
import { migrateDatabase } from "./migration-runner.ts";

describe("production migration runner", () => {
  it("holds the database advisory lock while migrations run", async () => {
    const events: Array<string> = [];

    await migrateDatabase(
      "postgres://test",
      {
        migrationsDir: "/migrations",
        afterMigrations: () => {
          events.push("bootstrap");
          return Promise.resolve();
        },
      },
      {
        withDatabaseAdvisoryLock: async (databaseUrl, evaluate) => {
          expect(databaseUrl).toBe("postgres://test");
          events.push("lock");
          try {
            return await evaluate();
          } finally {
            events.push("unlock");
          }
        },
        runMigrations: (databaseUrl, migrationsDir) => {
          expect(databaseUrl).toBe("postgres://test");
          expect(migrationsDir).toBe("/migrations");
          events.push("migrate");
          return Promise.resolve();
        },
        migrateWorkflowStorage: (databaseUrl) => {
          expect(databaseUrl).toBe("postgres://test");
          events.push("workflow");
          return Promise.resolve();
        },
      },
    );

    expect(events).toEqual([
      "lock",
      "migrate",
      "workflow",
      "bootstrap",
      "unlock",
    ]);
  });
});
