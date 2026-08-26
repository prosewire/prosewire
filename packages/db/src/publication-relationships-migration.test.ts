import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env["DATABASE_URL"];

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function withOldContentSchema(
  run: (client: Client, schemaName: string) => Promise<void>,
) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const schemaName = `test_relationships_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`create schema ${quoted(schemaName)}`);
    await client.query(`set search_path to ${quoted(schemaName)}`);
    await client.query(`
      create table author (
        id uuid primary key,
        blog_id uuid not null
      );
      create table category (
        id uuid primary key,
        blog_id uuid not null
      );
      create table post (
        id uuid primary key,
        blog_id uuid not null,
        author_id uuid not null,
        constraint post_author_id_author_id_fk
          foreign key (author_id) references author(id) on delete restrict
      );
      create table post_category (
        post_id uuid not null,
        category_id uuid not null,
        primary key (post_id, category_id),
        constraint post_category_post_id_post_id_fk
          foreign key (post_id) references post(id) on delete cascade,
        constraint post_category_category_id_category_id_fk
          foreign key (category_id) references category(id) on delete cascade
      )
    `);
    await run(client, schemaName);
  } finally {
    await client.query(`drop schema if exists ${quoted(schemaName)} cascade`);
    await client.end();
  }
}

async function migrationFor(schemaName: string): Promise<string> {
  return (
    await readFile(
      new URL("../drizzle/0011_flaky_bug.sql", import.meta.url),
      "utf8",
    )
  ).replaceAll('"public".', `${quoted(schemaName)}.`);
}

describe.skipIf(!databaseUrl)("publication relationship migration", () => {
  it("stops before adding constraints when existing post authors cross publications", () =>
    withOldContentSchema(async (client, schemaName) => {
      await client.query(`
        insert into author (id, blog_id)
        values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        insert into post (id, blog_id, author_id)
        values (
          '22222222-2222-4222-8222-222222222222',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          '11111111-1111-4111-8111-111111111111'
        )
      `);

      await expect(
        client.query(await migrationFor(schemaName)),
      ).rejects.toThrow(/post rows reference authors from another publication/);
    }));

  it("stops before backfill when an existing category link crosses publications", () =>
    withOldContentSchema(async (client, schemaName) => {
      await client.query(`
        insert into author (id, blog_id)
        values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        insert into category (id, blog_id)
        values ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
        insert into post (id, blog_id, author_id)
        values (
          '22222222-2222-4222-8222-222222222222',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '11111111-1111-4111-8111-111111111111'
        );
        insert into post_category (post_id, category_id)
        values (
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333'
        )
      `);

      await expect(
        client.query(await migrationFor(schemaName)),
      ).rejects.toThrow(/post-category rows cross publication boundaries/);
    }));

  it("backfills join rows and rejects future cross-publication links", () =>
    withOldContentSchema(async (client, schemaName) => {
      await client.query(`
        insert into author (id, blog_id) values
          ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
          ('11111111-1111-4111-8111-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
        insert into category (id, blog_id) values
          ('33333333-3333-4333-8333-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
          ('33333333-3333-4333-8333-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
        insert into post (id, blog_id, author_id)
        values (
          '22222222-2222-4222-8222-222222222222',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '11111111-1111-4111-8111-111111111111'
        );
        insert into post_category (post_id, category_id)
        values (
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-111111111111'
        )
      `);

      await client.query(await migrationFor(schemaName));

      const backfilled = await client.query<{ blog_id: string }>(
        "select blog_id from post_category",
      );
      expect(backfilled.rows).toEqual([
        { blog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ]);

      await expect(
        client.query(`
          insert into post (id, blog_id, author_id)
          values (
            '22222222-2222-4222-8222-333333333333',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '11111111-1111-4111-8111-222222222222'
          )
        `),
      ).rejects.toMatchObject({ code: "23503" });

      await expect(
        client.query(`
          insert into post_category (post_id, category_id)
          values (
            '22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-222222222222'
          )
        `),
      ).rejects.toMatchObject({ code: "23503" });

      await client.query("delete from post_category");
      await client.query(`
        insert into post_category (post_id, category_id)
        values (
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-111111111111'
        )
      `);
      const compatibleInsert = await client.query<{ blog_id: string }>(
        "select blog_id from post_category",
      );
      expect(compatibleInsert.rows).toEqual([
        { blog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ]);
    }));
});
