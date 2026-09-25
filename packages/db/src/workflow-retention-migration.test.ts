import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(!databaseUrl)("workflow retention migration", () => {
  it("keeps existing outbox rows eligible for terminal-state verification", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const migration = await readFile(
      new URL("../drizzle/0016_cold_darkhawk.sql", import.meta.url),
      "utf8",
    );
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(
        "create temporary table email_delivery_outbox (id text primary key, text text not null)",
      );
      await client.query(
        "insert into email_delivery_outbox values ('pending', 'preserve me')",
      );
      await client.query(migration);
      expect(
        (await client.query("select * from email_delivery_outbox")).rows,
      ).toEqual([
        {
          id: "pending",
          text: "preserve me",
          workflow_prune_started_at: null,
          workflow_pruned_at: null,
        },
      ]);
    } finally {
      await client.end();
    }
  });
});
