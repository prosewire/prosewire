import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export async function runMigrations(databaseUrl: string, migrationsFolder?: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool);
  const candidates = [
    migrationsFolder,
    process.env["PROSEWIRE_MIGRATIONS_DIR"],
    path.resolve(process.cwd(), "packages/db/drizzle"),
    path.resolve(process.cwd(), "../../packages/db/drizzle"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const folder = candidates.find((candidate) => existsSync(path.join(candidate, "meta", "_journal.json"))) ?? candidates[0];
  if (!folder) throw new Error("Could not resolve the Drizzle migrations directory");
  try {
    await migrate(database, { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}
