import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { type Db, openDb } from "./client.ts";

interface MigrationJournal {
  readonly entries: ReadonlyArray<{ readonly tag: string }>;
}

export interface TestDatabase {
  readonly client: Db;
  readonly schemaName: string;
  readonly url: string;
  readonly reset: () => Promise<void>;
  readonly close: () => Promise<void>;
}

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function requireTestDatabase(databaseUrl: string): URL {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.slice(1);
  const configuredSearchPath = parsed.searchParams.get("options") ?? "";
  if (
    !/(acceptance|test)/i.test(databaseName) &&
    !/(acceptance|test)/i.test(configuredSearchPath)
  ) {
    throw new Error(
      `Refusing to create a test schema in ${databaseName}; use a database or search_path containing test or acceptance`,
    );
  }
  return parsed;
}

export async function openTestDatabase(
  databaseUrl: string,
  label: string,
): Promise<TestDatabase> {
  const parsed = requireTestDatabase(databaseUrl);
  const normalizedLabel = label.replaceAll(/[^a-zA-Z0-9]/g, "_").slice(0, 24);
  const schemaName = `test_${normalizedLabel}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const administrativeUrl = new URL(parsed);
  administrativeUrl.searchParams.delete("options");
  const administrativeClient = new Client({
    connectionString: administrativeUrl.toString(),
  });
  await administrativeClient.connect();
  await administrativeClient.query(`create schema ${quoted(schemaName)}`);

  const scopedUrl = new URL(parsed);
  scopedUrl.searchParams.set("options", `-csearch_path=${schemaName}`);
  const resource = openDb(scopedUrl.toString());
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    await resource.close();
    try {
      await administrativeClient.query(
        `drop schema if exists ${quoted(schemaName)} cascade`,
      );
    } finally {
      await administrativeClient.end();
    }
  };

  try {
    const migrationsDirectory = fileURLToPath(
      new URL("../drizzle/", import.meta.url),
    );
    const journal = JSON.parse(
      await readFile(`${migrationsDirectory}meta/_journal.json`, "utf8"),
    ) as MigrationJournal;
    for (const entry of journal.entries) {
      const migration = (
        await readFile(`${migrationsDirectory}${entry.tag}.sql`, "utf8")
      ).replaceAll('"public".', `${quoted(schemaName)}.`);
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) {
          await resource.client.execute(sql.raw(statement));
        }
      }
    }
  } catch (cause) {
    await close();
    throw cause;
  }

  const reset = async () => {
    const result = await administrativeClient.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = $1 order by tablename",
      [schemaName],
    );
    if (result.rows.length === 0) return;
    const tables = result.rows
      .map(({ tablename }) => `${quoted(schemaName)}.${quoted(tablename)}`)
      .join(", ");
    await administrativeClient.query(
      `truncate table ${tables} restart identity cascade`,
    );
  };

  return {
    client: resource.client,
    schemaName,
    url: scopedUrl.toString(),
    reset,
    close,
  };
}
