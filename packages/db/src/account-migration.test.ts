import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env["DATABASE_URL"];

async function withIssuerAccounts(
  run: (client: Client, migration: string) => Promise<void>,
) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const migration = await readFile(
    new URL("../drizzle/0015_freezing_norman_osborn.sql", import.meta.url),
    "utf8",
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      create temporary table account (
        id text primary key,
        account_id text not null,
        provider_id text not null,
        issuer text not null
      );
      create unique index account_issuer_account_id_unique on account (issuer, account_id);
      insert into account values ('existing', 'subject', 'credential', 'local:credential');
    `);
    await run(client, migration);
  } finally {
    await client.end();
  }
}

describe.skipIf(!databaseUrl)("Better Auth provider account migration", () => {
  it("preserves issuer history and accepts new accounts keyed by provider", async () => {
    await withIssuerAccounts(async (client, migration) => {
      await client.query(migration);
      await client.query(`
        insert into account (id, account_id, provider_id)
        values ('new-credential', 'new-subject', 'credential'),
               ('google', 'subject', 'google'), ('github', 'subject', 'github');
      `);
      expect(
        (await client.query("select issuer from account where id = 'existing'"))
          .rows,
      ).toEqual([{ issuer: "local:credential" }]);
      expect(
        (
          await client.query(
            "select issuer from account where id = 'new-credential'",
          )
        ).rows,
      ).toEqual([{ issuer: null }]);
      await expect(
        client.query(`
        insert into account (id, account_id, provider_id, issuer)
        values ('duplicate', 'subject', 'credential', 'another-issuer')
      `),
      ).rejects.toMatchObject({ code: "23505" });
    });
  });

  it("refuses provider collisions before relaxing the old constraints", async () => {
    await withIssuerAccounts(async (client, migration) => {
      await client.query(`
        insert into account values ('collision', 'subject', 'credential', 'another-issuer')
      `);
      await expect(client.query(migration)).rejects.toMatchObject({
        code: "23505",
      });
      expect(
        (await client.query("select count(*)::int as count from account")).rows,
      ).toEqual([{ count: 2 }]);
      await expect(
        client.query(`
        insert into account (id, account_id, provider_id) values ('missing-issuer', 'new', 'google')
      `),
      ).rejects.toMatchObject({ code: "23502" });
    });
  });
});

describe.skipIf(!databaseUrl)("Better Auth account issuer migration", () => {
  it("backfills credential issuers and enforces account identity uniqueness", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const migration = await readFile(
      new URL("../drizzle/0006_fixed_doorman.sql", import.meta.url),
      "utf8",
    );
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(`
        create temporary table account (
          id text primary key,
          user_id text not null,
          account_id text not null,
          provider_id text not null
        )
      `);
      await client.query(`
        insert into account (id, user_id, account_id, provider_id)
        values ('account-1', 'user-1', 'user-1', 'credential')
      `);

      await client.query(migration);

      const result = await client.query<{ issuer: string }>(
        "select issuer from account where id = 'account-1'",
      );
      expect(result.rows).toEqual([{ issuer: "local:credential" }]);
      await expect(
        client.query(`
          insert into account (id, user_id, account_id, provider_id, issuer)
          values ('account-2', 'user-1', 'user-1', 'credential', 'local:credential')
        `),
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      await client.end();
    }
  });

  it("refuses to guess the issuer for an unsupported provider", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const migration = await readFile(
      new URL("../drizzle/0006_fixed_doorman.sql", import.meta.url),
      "utf8",
    );
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(`
        create temporary table account (
          id text primary key,
          user_id text not null,
          account_id text not null,
          provider_id text not null
        )
      `);
      await client.query(`
        insert into account (id, user_id, account_id, provider_id)
        values ('account-1', 'user-1', 'provider-user-1', 'custom-oauth')
      `);

      await expect(client.query(migration)).rejects.toThrow(
        /Unable to infer a trusted issuer/,
      );
    } finally {
      await client.end();
    }
  });
});
