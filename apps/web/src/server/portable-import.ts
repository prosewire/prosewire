import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ApiImportConflict,
  ApiImportRejected,
  type PortableImportReport,
} from "@prosewire/contract";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { notifyWorker } from "@prosewire/jobs/worker-wake";
import { and, eq, sql, sum } from "drizzle-orm";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import { ApiAccess } from "./api-access.ts";
import { Database } from "./database.ts";
import type { BlogId } from "./domain.ts";
import { type ImportFiles, importCollections } from "./import-files.ts";
import {
  type Prepared,
  preparedRecords,
  prepareImport,
} from "./import-preparation.ts";
import { MediaImage } from "./media-image.ts";
import { ObjectStorage } from "./object-storage.ts";
import {
  lockApiWrite,
  type TransactionClient,
} from "./transactional-access.ts";

class ImportPersistenceError extends Schema.TaggedError<ImportPersistenceError>()(
  "ImportPersistenceError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Unable to complete publication import";
  }
}
const rejected = (item: string, message: string) =>
  new ApiImportRejected({ item, message });
const conflict = (item: string, message: string) =>
  new ApiImportConflict({ item, message });
type ImportError = ApiImportRejected | ApiImportConflict;
type WriteError =
  | ImportError
  | ApiAccess.AuthenticationFailed
  | ApiAccess.ScopeDenied;
type RunEffect = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;

function sameValues(
  existing: Record<string, unknown>,
  desired: Record<string, unknown>,
) {
  const comparable = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(comparable);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, comparable(entry)]),
      );
    return value;
  };
  return Object.entries(desired).every(
    ([key, value]) =>
      JSON.stringify(comparable(existing[key])) ===
      JSON.stringify(comparable(value)),
  );
}
async function existingRecord(tx: TransactionClient, record: Prepared) {
  const id = record.values.id;
  const blogId = record.values.blogId;
  switch (record.collection) {
    case "authors":
      return tx.query.author.findFirst({
        where: and(
          eq(schema.author.blogId, blogId),
          eq(schema.author.slug, String(record.values["slug"])),
        ),
      });
    case "categories":
      return tx.query.category.findFirst({
        where: and(
          eq(schema.category.blogId, blogId),
          eq(schema.category.slug, String(record.values["slug"])),
        ),
      });
    case "snippets":
      return tx.query.snippet.findFirst({
        where: and(
          eq(schema.snippet.blogId, blogId),
          eq(schema.snippet.key, String(record.values["key"])),
        ),
      });
    case "redirects":
      return tx.query.redirect.findFirst({
        where: and(
          eq(schema.redirect.blogId, blogId),
          eq(schema.redirect.fromPath, String(record.values["fromPath"])),
        ),
      });
    case "mediaAssets":
      return tx.query.mediaAsset.findFirst({
        where: and(
          eq(schema.mediaAsset.blogId, blogId),
          eq(schema.mediaAsset.id, id),
        ),
      });
    case "posts":
      return tx.query.post.findFirst({
        where: and(
          eq(schema.post.blogId, blogId),
          eq(schema.post.slug, String(record.values["slug"])),
        ),
      });
  }
}
function matchingRows(
  existing: ReadonlyArray<Record<string, unknown>>,
  desired: ReadonlyArray<Record<string, unknown>>,
  key: string,
) {
  return (
    existing.length === desired.length &&
    desired.every((row) => {
      const found = existing.find((candidate) => candidate[key] === row[key]);
      return found !== undefined && sameValues(found, row);
    })
  );
}
async function matchingPostRelationships(
  tx: TransactionClient,
  record: Prepared,
) {
  const links = await tx.query.postCategory.findMany({
    where: eq(schema.postCategory.postId, record.values.id),
  });
  if (
    JSON.stringify(links.map((link) => link.categoryId).sort()) !==
    JSON.stringify([...(record.categoryIds ?? [])].sort())
  )
    return false;
  const revisions = await tx.query.postRevision.findMany({
    where: eq(schema.postRevision.postId, record.values.id),
  });
  return matchingRows(revisions, record.revisions ?? [], "id");
}
async function matchingRelationships(tx: TransactionClient, record: Prepared) {
  if (record.collection === "posts")
    return matchingPostRelationships(tx, record);
  if (record.collection !== "mediaAssets") return true;
  const variants = await tx.query.mediaVariant.findMany({
    where: eq(schema.mediaVariant.assetId, record.values.id),
  });
  return matchingRows(variants, record.variants ?? [], "kind");
}
async function insertPost(tx: TransactionClient, record: Prepared) {
  await tx
    .insert(schema.post)
    .values(record.values as typeof schema.post.$inferInsert);
  if (record.categoryIds?.length)
    await tx.insert(schema.postCategory).values(
      record.categoryIds.map((categoryId) => ({
        postId: record.values.id,
        blogId: record.values.blogId,
        categoryId,
      })),
    );
  if (record.revisions?.length)
    await tx.insert(schema.postRevision).values([...record.revisions]);
}
async function insertRecord(tx: TransactionClient, record: Prepared) {
  switch (record.collection) {
    case "authors":
      await tx
        .insert(schema.author)
        .values(record.values as typeof schema.author.$inferInsert);
      break;
    case "categories":
      await tx
        .insert(schema.category)
        .values(record.values as typeof schema.category.$inferInsert);
      break;
    case "snippets":
      await tx
        .insert(schema.snippet)
        .values(record.values as typeof schema.snippet.$inferInsert);
      break;
    case "redirects":
      await tx
        .insert(schema.redirect)
        .values(record.values as typeof schema.redirect.$inferInsert);
      break;
    case "mediaAssets":
      await tx
        .insert(schema.mediaAsset)
        .values(record.values as typeof schema.mediaAsset.$inferInsert);
      if (record.variants?.length)
        await tx.insert(schema.mediaVariant).values([...record.variants]);
      break;
    case "posts":
      await insertPost(tx, record);
      break;
  }
}

async function cleanupFailedImport(
  client: Db,
  blogId: BlogId,
  written: ReadonlyArray<{ assetId: string; key: string }>,
  storage: ObjectStorage.Shape,
  run: RunEffect,
) {
  await client.transaction(async (tx) => {
    await tx
      .select({ id: schema.blog.id })
      .from(schema.blog)
      .where(eq(schema.blog.id, blogId))
      .for("update");
    const keys: string[] = [];
    for (const assetId of new Set(written.map((object) => object.assetId))) {
      const asset = await tx.query.mediaAsset.findFirst({
        where: and(
          eq(schema.mediaAsset.blogId, blogId),
          eq(schema.mediaAsset.id, assetId),
        ),
      });
      if (!asset)
        keys.push(
          ...written
            .filter((object) => object.assetId === assetId)
            .map((object) => object.key),
        );
    }
    if (keys.length) await run(storage.delete(keys));
  });
}

function validateLanguages(record: Prepared, locales: ReadonlyArray<string>) {
  if (record.collection !== "posts") return;
  if (!locales.includes(String(record.values["locale"])))
    throw rejected(
      record.item,
      "Configure the post language in the destination publication first",
    );
  if (
    (record.revisions ?? []).some(
      (revision) => !locales.includes(String(revision.snapshot["locale"])),
    )
  )
    throw rejected(
      record.item,
      "Configure revision languages in the destination publication first",
    );
}
async function validateSlugReservation(
  tx: TransactionClient,
  record: Prepared,
) {
  if (record.collection === "posts") {
    const redirect = await tx.query.redirect.findFirst({
      where: and(
        eq(schema.redirect.blogId, record.values.blogId),
        eq(schema.redirect.fromPath, String(record.values["slug"])),
      ),
    });
    if (redirect)
      throw conflict(
        record.item,
        "Post slug is reserved by an existing redirect",
      );
  }
  if (record.collection === "redirects") {
    const post = await tx.query.post.findFirst({
      where: and(
        eq(schema.post.blogId, record.values.blogId),
        eq(schema.post.slug, String(record.values["fromPath"])),
      ),
    });
    if (post)
      throw conflict(record.item, "Redirect would hide an existing post");
  }
}
async function validateExistingRecord(tx: TransactionClient, record: Prepared) {
  const existing = await existingRecord(tx, record);
  if (!existing) return false;
  if (
    !sameValues(existing, record.values) ||
    !(await matchingRelationships(tx, record))
  )
    throw conflict(
      record.item,
      "Import would overwrite existing content; updates are unsupported",
    );
  return true;
}
async function validateDestination(
  tx: TransactionClient,
  files: ImportFiles,
  publication: typeof schema.blog.$inferSelect,
) {
  let existingCount = 0;
  let total = 0;
  let storageBytes = 0;
  for (const collection of importCollections) {
    for await (const record of preparedRecords(files, collection)) {
      total++;
      validateLanguages(record, publication.locales);
      if (await validateExistingRecord(tx, record)) existingCount++;
      if (collection === "mediaAssets")
        storageBytes += Number(record.values["storageBytes"]);
      await validateSlugReservation(tx, record);
    }
  }
  if (existingCount !== 0 && existingCount !== total)
    throw conflict(
      "import",
      "Only an unchanged complete import can be retried",
    );
  return {
    alreadyImported: total > 0 && existingCount === total,
    storageBytes,
  };
}
async function writeImport(
  tx: TransactionClient,
  files: ImportFiles,
  storage: ObjectStorage.Shape,
  written: Array<{ assetId: string; key: string }>,
  run: RunEffect,
) {
  for await (const record of preparedRecords(files, "mediaAssets")) {
    for (const variant of record.variants ?? []) {
      const body = await readFile(
        join(files.directory, `${record.values.id}-${variant.kind}`),
      );
      written.push({ assetId: record.values.id, key: variant.storageKey });
      await run(storage.put(variant.storageKey, variant.mimeType, body));
    }
  }
  let hasScheduledPosts = false;
  for (const collection of [
    "authors",
    "categories",
    "snippets",
    "mediaAssets",
    "posts",
    "redirects",
  ] as const) {
    for await (const record of preparedRecords(files, collection)) {
      await insertRecord(tx, record);
      if (
        record.collection === "posts" &&
        record.values["status"] === "scheduled"
      )
        hasScheduledPosts = true;
    }
  }
  return hasScheduledPosts;
}

async function authorizeDestination(
  tx: TransactionClient,
  principal: ApiAccess.Principal,
  now: () => Date,
) {
  const [publication] = await tx
    .select()
    .from(schema.blog)
    .where(eq(schema.blog.id, principal.blogId))
    .for("update");
  const authorization = await lockApiWrite(
    tx,
    principal.blogId,
    principal.keyId,
    now(),
  );
  if ("error" in authorization) throw authorization.error;
  if (!publication)
    throw conflict("publication", "Destination publication is missing");
  return { publication, authorization };
}

export const create = Effect.fn("PortableImport.create")(function* () {
  const database = yield* Database;
  const storage = yield* ObjectStorage.Service;
  const images = yield* MediaImage.Service;
  return {
    run: Effect.fn("PortableImport.run")(function* (
      files: ImportFiles,
      principal: ApiAccess.Principal,
      mode: "preview" | "apply",
      preserveStates: boolean,
    ): Effect.fn.Return<
      PortableImportReport,
      WriteError | ImportPersistenceError
    > {
      const clock = yield* Clock.Clock;
      const run = Effect.runPromiseWith(yield* Effect.context<never>());
      const written: Array<{ assetId: string; key: string }> = [];
      yield* Effect.tryPromise({
        try: () =>
          prepareImport(
            files,
            principal.blogId,
            preserveStates,
            storage,
            images,
            run,
          ),
        catch: (cause) =>
          cause instanceof ApiImportRejected
            ? cause
            : new ImportPersistenceError({ cause }),
      }).pipe(Effect.uninterruptible);
      let needsWake = false;
      return yield* database
        .execute("publication.import", (client) =>
          client
            .transaction(async (tx) => {
              // Serializes imports, quota claims, and publication settings; key revocation
              // is rechecked after potentially slow parsing and image work.
              const { publication, authorization } = await authorizeDestination(
                tx,
                principal,
                () => new Date(clock.currentTimeMillisUnsafe()),
              );
              const { alreadyImported, storageBytes } =
                await validateDestination(tx, files, publication);
              const report: PortableImportReport = {
                mode,
                fingerprint: files.fingerprint,
                preserveStates,
                counts: files.counts,
                alreadyImported,
              };
              if (alreadyImported) return report;
              const [usage] = await tx
                .select({ bytes: sum(schema.mediaAsset.storageBytes) })
                .from(schema.mediaAsset)
                .where(
                  and(
                    eq(schema.mediaAsset.blogId, principal.blogId),
                    sql`${schema.mediaAsset.status} in ('pending', 'processing', 'ready')`,
                  ),
                );
              if (
                Number(usage?.bytes ?? 0) + storageBytes >
                publication.mediaStorageQuotaBytes
              )
                throw rejected(
                  "mediaAssets",
                  "Import exceeds destination media storage quota",
                );
              if (mode === "preview") return report;
              try {
                // These objects have fresh deterministic IDs. Cleanup runs while the
                // publication lock is still held, before a retry can reuse their keys.
                needsWake = await writeImport(tx, files, storage, written, run);
                await tx.insert(schema.auditLog).values({
                  organizationId: authorization.organizationId,
                  blogId: principal.blogId,
                  actorId: null,
                  action: "publication.imported",
                  entityType: "blog",
                  entityId: principal.blogId,
                  after: {
                    source: "api",
                    apiKeyId: principal.keyId,
                    fingerprint: files.fingerprint,
                    preserveStates,
                    counts: files.counts,
                  },
                });
                return report;
              } catch (cause) {
                if (written.length)
                  await run(
                    storage.delete(written.map((object) => object.key)).pipe(
                      Effect.tapError(() =>
                        Effect.logError(
                          "Unable to remove failed import objects",
                        ),
                      ),
                      Effect.ignore,
                    ),
                  );
                throw cause;
              }
            })
            .catch(async (cause: unknown) => {
              // COMMIT can fail after the callback has succeeded. Reacquire the
              // publication lock and check persisted ownership before deleting;
              // a successful concurrent retry must keep its objects.
              if (written.length) {
                try {
                  await cleanupFailedImport(
                    client,
                    principal.blogId,
                    written,
                    storage,
                    run,
                  );
                } catch {
                  await run(
                    Effect.logError(
                      "Unable to clean up failed import objects after rollback",
                    ),
                  );
                }
              }
              throw cause;
            }),
        )
        .pipe(
          // Finish the database transaction and compensation before scoped temp-file cleanup.
          Effect.uninterruptible,
          Effect.tap(() => (needsWake ? notifyWorker : Effect.void)),
          Effect.mapError((error) => {
            const cause = error.cause;
            return cause instanceof ApiImportRejected ||
              cause instanceof ApiImportConflict ||
              cause instanceof ApiAccess.AuthenticationFailed ||
              cause instanceof ApiAccess.ScopeDenied
              ? cause
              : new ImportPersistenceError({ cause });
          }),
        );
    }),
  };
});
export type Interface = Effect.Success<ReturnType<typeof create>>;
export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/PortableImport",
) {}
export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);
export * as PortableImport from "./portable-import";
