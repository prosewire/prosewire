import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Client } from "pg";

const databaseUrl = process.env["DATABASE_URL"];

describe.skipIf(!databaseUrl)("invitation migration upgrade", () => {
  it("deduplicates existing pending invitations before adding the invariant", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const migration = await readFile(
      new URL("../drizzle/0004_dear_lizard.sql", import.meta.url),
      "utf8",
    );
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(`
        create temporary table invitation (
          id text primary key,
          organization_id text not null,
          email text not null,
          status text not null,
          created_at timestamptz not null
        )
      `);
      await client.query(`
        insert into invitation (id, organization_id, email, status, created_at)
        values
          ('older', 'workspace-1', 'person@example.com', 'pending', '2026-08-19T00:00:00Z'),
          ('newer', 'workspace-1', 'person@example.com', 'pending', '2026-08-20T00:00:00Z')
      `);

      await client.query(migration);

      const result = await client.query<{ id: string; status: string }>(
        "select id, status from invitation order by id",
      );
      expect(result.rows).toEqual([
        { id: "newer", status: "pending" },
        { id: "older", status: "canceled" },
      ]);
      await expect(
        client.query(`
          insert into invitation (id, organization_id, email, status, created_at)
          values ('duplicate', 'workspace-1', 'person@example.com', 'pending', now())
        `),
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      await client.end();
    }
  });
});
