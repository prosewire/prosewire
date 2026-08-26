import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(!databaseUrl)("bootstrap password migration", () => {
  it("keeps existing and new users outside the forced-change flow", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const migration = await readFile(
      new URL("../drizzle/0013_friendly_slipstream.sql", import.meta.url),
      "utf8",
    );
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(`
        create temporary table "user" (
          id text primary key
        )
      `);
      await client.query(`insert into "user" (id) values ('existing-user')`);
      await client.query(migration);
      await client.query(`insert into "user" (id) values ('new-user')`);

      const result = await client.query<{
        id: string;
        must_change_password: boolean;
      }>(`
        select id, must_change_password
        from "user"
        order by id
      `);
      expect(result.rows).toEqual([
        { id: "existing-user", must_change_password: false },
        { id: "new-user", must_change_password: false },
      ]);
    } finally {
      await client.end();
    }
  });
});
