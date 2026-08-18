import { getDb, type Db } from "@prosewire/db";

let cached: Db | undefined;

export function db(): Db {
  cached ??= getDb();
  return cached;
}
