import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env["DATABASE_URL"];

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function withOldLocaleSchema(
  run: (client: Client) => Promise<void>,
): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const schemaName = `test_locales_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`create schema ${quoted(schemaName)}`);
    await client.query(`set search_path to ${quoted(schemaName)}`);
    await client.query(`
      create table blog (
        id uuid primary key,
        locale text not null default 'en'
      );
      create table post (
        id uuid primary key,
        blog_id uuid not null references blog(id),
        locale text not null default 'en'
      )
    `);
    await run(client);
  } finally {
    await client.query(`drop schema if exists ${quoted(schemaName)} cascade`);
    await client.end();
  }
}

async function migration(): Promise<string> {
  return readFile(
    new URL("../drizzle/0012_magical_rumiko_fujikawa.sql", import.meta.url),
    "utf8",
  );
}

describe.skipIf(!databaseUrl)("publication locales migration", () => {
  it("keeps each publication default and every locale already used by posts", () =>
    withOldLocaleSchema(async (client) => {
      const blogId = "11111111-1111-4111-8111-111111111111";
      await client.query(`insert into blog (id, locale) values ($1, 'fr')`, [
        blogId,
      ]);
      await client.query(
        `insert into post (id, blog_id, locale) values
          ('22222222-2222-4222-8222-222222222222', $1, 'fr'),
          ('33333333-3333-4333-8333-333333333333', $1, 'de')`,
        [blogId],
      );

      await client.query(await migration());

      const migrated = await client.query<{
        locale: string;
        locales: Array<string>;
      }>("select locale, locales from blog where id = $1", [blogId]);
      expect(migrated.rows).toEqual([{ locale: "fr", locales: ["de", "fr"] }]);

      const newBlogId = "44444444-4444-4444-8444-444444444444";
      await client.query("insert into blog (id) values ($1)", [newBlogId]);
      const created = await client.query<{ locales: Array<string> }>(
        "select locales from blog where id = $1",
        [newBlogId],
      );
      expect(created.rows).toEqual([{ locales: ["en"] }]);

      await expect(
        client.query("update blog set locale = 'es' where id = $1", [blogId]),
      ).rejects.toMatchObject({ code: "23514" });
    }));
});
