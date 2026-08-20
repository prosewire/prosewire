import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.ts";

function makeClient(pool: Pool) {
  return drizzle(pool, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof makeClient>;

export interface DbResource {
  readonly client: Db;
  readonly close: () => Promise<void>;
}

export function openDb(databaseUrl: string): DbResource {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = makeClient(pool);
  let closed = false;

  return {
    client,
    close: async () => {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };
}

let cachedResource: DbResource | undefined;

export function getDb(): Db {
  if (cachedResource) return cachedResource.client;
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  cachedResource = openDb(url);
  return cachedResource.client;
}

export async function closeDb(): Promise<void> {
  const resource = cachedResource;
  cachedResource = undefined;
  await resource?.close();
}
