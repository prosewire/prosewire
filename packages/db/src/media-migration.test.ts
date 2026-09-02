import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env["DATABASE_URL"];

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function withPreMediaSchema(
  run: (client: Client, schemaName: string) => Promise<void>,
) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const schemaName = `test_media_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`create schema ${quoted(schemaName)}`);
    await client.query(`set search_path to ${quoted(schemaName)}`);
    await client.query(`
      create table "user" (id text primary key);
      create table blog (id uuid primary key);
      create table post (
        id uuid primary key,
        blog_id uuid not null references blog(id)
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
      new URL("../drizzle/0014_yummy_wildside.sql", import.meta.url),
      "utf8",
    )
  ).replaceAll('"public".', `${quoted(schemaName)}.`);
}

describe.skipIf(!databaseUrl)("media migration", () => {
  it("adds quota defaults and keeps media references inside a publication", () =>
    withPreMediaSchema(async (client, schemaName) => {
      const firstBlog = "11111111-1111-4111-8111-111111111111";
      const secondBlog = "22222222-2222-4222-8222-222222222222";
      const assetId = "33333333-3333-4333-8333-333333333333";
      await client.query("insert into blog (id) values ($1), ($2)", [
        firstBlog,
        secondBlog,
      ]);

      await client.query(await migrationFor(schemaName));

      const publications = await client.query<{
        media_storage_quota_bytes: string;
      }>("select media_storage_quota_bytes from blog order by id");
      expect(publications.rows).toEqual([
        { media_storage_quota_bytes: "1073741824" },
        { media_storage_quota_bytes: "1073741824" },
      ]);
      await expect(
        client.query(
          "update blog set media_storage_quota_bytes = 0 where id = $1",
          [firstBlog],
        ),
      ).rejects.toMatchObject({ code: "23514" });

      await client.query(
        `insert into media_asset (
          id, blog_id, original_filename, declared_mime_type, byte_size,
          storage_bytes, upload_storage_key, upload_expires_at
        ) values ($1, $2, 'cover.png', 'image/png', 10, 10, 'uploads/cover', now())`,
        [assetId, firstBlog],
      );

      await expect(
        client.query(
          "insert into post (id, blog_id, cover_image_asset_id) values ($1, $2, $3)",
          [randomUUID(), secondBlog, assetId],
        ),
      ).rejects.toMatchObject({ code: "23503" });

      await client.query(
        "insert into post (id, blog_id, cover_image_asset_id) values ($1, $2, $3)",
        [randomUUID(), firstBlog, assetId],
      );
      await expect(
        client.query("delete from media_asset where id = $1", [assetId]),
      ).rejects.toMatchObject({ code: "23503" });
    }));

  it("enforces processed variant shape and cascades variants with the asset", () =>
    withPreMediaSchema(async (client, schemaName) => {
      const blogId = "11111111-1111-4111-8111-111111111111";
      const assetId = "33333333-3333-4333-8333-333333333333";
      await client.query("insert into blog (id) values ($1)", [blogId]);
      await client.query(await migrationFor(schemaName));
      await client.query(
        `insert into media_asset (
          id, blog_id, original_filename, declared_mime_type, byte_size,
          storage_bytes, upload_storage_key, upload_expires_at
        ) values ($1, $2, 'cover.png', 'image/png', 10, 10, 'uploads/cover', now())`,
        [assetId, blogId],
      );

      await expect(
        client.query(
          `insert into media_variant (
            asset_id, kind, storage_key, public_url, mime_type, byte_size,
            width, height, checksum_sha256
          ) values ($1, 'unknown', 'bad', 'https://media.test/bad', 'image/png', 1, 1, 1, 'sum')`,
          [assetId],
        ),
      ).rejects.toMatchObject({ code: "23514" });

      await client.query(
        `insert into media_variant (
          asset_id, kind, storage_key, public_url, mime_type, byte_size,
          width, height, checksum_sha256
        ) values ($1, 'original', 'ready', 'https://media.test/ready', 'image/png', 1, 1, 1, 'sum')`,
        [assetId],
      );
      await client.query("delete from media_asset where id = $1", [assetId]);
      const variants = await client.query("select * from media_variant");
      expect(variants.rowCount).toBe(0);
    }));
});
