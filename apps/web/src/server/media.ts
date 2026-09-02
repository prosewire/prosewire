import { randomUUID } from "node:crypto";
import { canUpdatePost } from "@prosewire/core";
import type { Db } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Clock, Context, Effect, Layer, Result, Schema } from "effect";
import { BlogAccess } from "./authorization.ts";
import { Database } from "./database.ts";
import { BlogId, MediaAssetId, PostId, UserId } from "./domain.ts";
import { MediaImage } from "./media-image.ts";
import { ObjectStorage } from "./object-storage.ts";
import { operationError } from "./operation-error.ts";
import type { Actor } from "./post-commands.ts";

export const AssetStatus = Schema.Literals([
  "pending",
  "processing",
  "ready",
  "failed",
  "deleted",
]);
export type AssetStatus = typeof AssetStatus.Type;

export class AssetNotFound extends Schema.TaggedError<AssetNotFound>()(
  "MediaAssetNotFound",
  { assetId: MediaAssetId },
) {
  override get message(): string {
    return `Media asset ${this.assetId} was not found`;
  }
}

export class InvalidUpload extends Schema.TaggedError<InvalidUpload>()(
  "MediaInvalidUpload",
  { message: Schema.String },
) {}

export class UploadExpired extends Schema.TaggedError<UploadExpired>()(
  "MediaUploadExpired",
  { assetId: MediaAssetId },
) {
  override get message(): string {
    return `The upload for media asset ${this.assetId} has expired`;
  }
}

export class QuotaExceeded extends Schema.TaggedError<QuotaExceeded>()(
  "MediaQuotaExceeded",
  {
    quotaBytes: Schema.Finite,
    usedBytes: Schema.Finite,
    requestedBytes: Schema.Finite,
  },
) {
  override get message(): string {
    return "This upload would exceed the publication media quota";
  }
}

export class AssetInUse extends Schema.TaggedError<AssetInUse>()(
  "MediaAssetInUse",
  { assetId: MediaAssetId, referenceCount: Schema.Int },
) {
  override get message(): string {
    return `Media asset ${this.assetId} is used by ${this.referenceCount} post(s)`;
  }
}

export class InvalidState extends Schema.TaggedError<InvalidState>()(
  "MediaInvalidState",
  { assetId: MediaAssetId, status: AssetStatus },
) {
  override get message(): string {
    return `Media asset ${this.assetId} is ${this.status}`;
  }
}

export class BackupNotConfigured extends Schema.TaggedError<BackupNotConfigured>()(
  "MediaBackupNotConfigured",
  { message: Schema.String },
) {}

export class PersistenceError extends Schema.TaggedError<PersistenceError>()(
  "MediaPersistenceError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

export class StartUploadInput extends Schema.Class<StartUploadInput>(
  "Media.StartUploadInput",
)({
  blogId: BlogId,
  filename: Schema.String,
  mimeType: Schema.String,
  byteSize: Schema.Int,
}) {}

export class CompleteUploadInput extends Schema.Class<CompleteUploadInput>(
  "Media.CompleteUploadInput",
)({
  blogId: BlogId,
  assetId: MediaAssetId,
}) {}

export interface MediaVariant {
  readonly kind: "original" | "large" | "thumbnail";
  readonly url: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly checksumSha256: string;
}

export interface MediaReference {
  readonly postId: PostId;
  readonly title: string;
  readonly slug: string;
}

export interface MediaAsset {
  readonly id: MediaAssetId;
  readonly blogId: BlogId;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly storageBytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly checksumSha256: string | null;
  readonly status: AssetStatus;
  readonly url: string | null;
  readonly variants: ReadonlyArray<MediaVariant>;
  readonly references: ReadonlyArray<MediaReference>;
  readonly uploadedAt: string | null;
  readonly backedUpAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MediaUsage {
  readonly usedBytes: number;
  readonly quotaBytes: number;
  readonly remainingBytes: number;
}

export interface UploadReservation {
  readonly asset: MediaAsset;
  readonly upload: {
    readonly url: string;
    readonly method: "PUT";
    readonly headers: Readonly<Record<string, string>>;
    readonly expiresAt: string;
  };
  readonly usage: MediaUsage;
}

type AssetRow = typeof schema.mediaAsset.$inferSelect;
type VariantRow = typeof schema.mediaVariant.$inferSelect;
type PostReferenceRow = Pick<
  typeof schema.post.$inferSelect,
  "id" | "title" | "slug"
>;

function assetOutput(
  asset: AssetRow,
  variants: ReadonlyArray<VariantRow>,
  references: ReadonlyArray<PostReferenceRow>,
): MediaAsset {
  const ordered = [...variants].sort(
    (left, right) =>
      ["original", "large", "thumbnail"].indexOf(left.kind) -
      ["original", "large", "thumbnail"].indexOf(right.kind),
  );
  return {
    id: MediaAssetId.make(asset.id),
    blogId: BlogId.make(asset.blogId),
    filename: asset.originalFilename,
    mimeType: asset.detectedMimeType ?? asset.declaredMimeType,
    byteSize: asset.byteSize,
    storageBytes: asset.storageBytes,
    width: asset.width,
    height: asset.height,
    checksumSha256: asset.checksumSha256,
    status: asset.status,
    url: ordered.find((variant) => variant.kind === "large")?.publicUrl ?? null,
    variants: ordered.map((variant) => ({
      kind: variant.kind,
      url: variant.publicUrl,
      mimeType: variant.mimeType,
      byteSize: variant.byteSize,
      width: variant.width,
      height: variant.height,
      checksumSha256: variant.checksumSha256,
    })),
    references: references.map((reference) => ({
      postId: PostId.make(reference.id),
      title: reference.title,
      slug: reference.slug,
    })),
    uploadedAt: asset.uploadedAt?.toISOString() ?? null,
    backedUpAt: asset.backedUpAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function safeFilename(value: string): string | undefined {
  const filename = value
    .split(/[\\/]/)
    .at(-1)
    ?.split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
  return filename && filename.length <= 255 ? filename : undefined;
}

function normalizedMimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function activeAssetFilter(blogId: BlogId) {
  return and(
    eq(schema.mediaAsset.blogId, blogId),
    inArray(schema.mediaAsset.status, ["pending", "processing", "ready"]),
  );
}

export const create = Effect.fn("Media.create")(function* () {
  const database = yield* Database;
  const access = yield* BlogAccess.Service;
  const storage = yield* ObjectStorage.Service;
  const images = yield* MediaImage.Service;
  const persistenceError = operationError(
    (input) => new PersistenceError(input),
  );
  const execute = <A>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<A>,
  ) => database.execute(operation, evaluate).pipe(persistenceError(operation));
  const executeResult = <A, E>(
    operation: string,
    evaluate: (client: Db) => PromiseLike<Result.Result<A, E>>,
  ): Effect.Effect<A, PersistenceError | E> =>
    execute(operation, evaluate).pipe(
      Effect.flatMap(
        Result.match({ onFailure: Effect.fail, onSuccess: Effect.succeed }),
      ),
    );

  const authorize = Effect.fn("Media.authorize")(function* (
    blogId: BlogId,
    actor: Actor,
    capability: "read" | "write",
  ) {
    if (actor._tag === "Api") return undefined;
    return capability === "read"
      ? yield* access.requireRead(blogId, actor.userId)
      : yield* access.requirePostCreate(blogId, actor.userId);
  });

  const loadAsset = Effect.fn("Media.loadAsset")(function* (
    blogId: BlogId,
    assetId: MediaAssetId,
    includeDeleted = false,
  ) {
    const row = yield* execute("mediaAsset.get", (client) =>
      client.query.mediaAsset.findFirst({
        where: and(
          eq(schema.mediaAsset.id, assetId),
          eq(schema.mediaAsset.blogId, blogId),
          ...(includeDeleted ? [] : [ne(schema.mediaAsset.status, "deleted")]),
        ),
        with: {
          variants: true,
          coverPosts: { columns: { id: true, title: true, slug: true } },
        },
      }),
    );
    if (!row) return yield* new AssetNotFound({ assetId });
    return assetOutput(row, row.variants, row.coverPosts);
  });

  const usage = Effect.fn("Media.usage")(function* (blogId: BlogId) {
    const result = yield* execute("mediaAsset.usage", async (client) => {
      const [publication, totals] = await Promise.all([
        client.query.blog.findFirst({
          columns: { mediaStorageQuotaBytes: true },
          where: eq(schema.blog.id, blogId),
        }),
        client
          .select({
            value: sql<string>`coalesce(sum(${schema.mediaAsset.storageBytes}), 0)`,
          })
          .from(schema.mediaAsset)
          .where(activeAssetFilter(blogId)),
      ]);
      return {
        quotaBytes: publication?.mediaStorageQuotaBytes,
        usedBytes: Number(totals[0]?.value ?? 0),
      };
    });
    if (result.quotaBytes === undefined) {
      return yield* new PersistenceError({
        operation: "mediaAsset.usage publication missing",
        cause: new Error("Publication was not found"),
      });
    }
    return {
      usedBytes: result.usedBytes,
      quotaBytes: result.quotaBytes,
      remainingBytes: Math.max(0, result.quotaBytes - result.usedBytes),
    } satisfies MediaUsage;
  });

  const list = Effect.fn("Media.list")(function* (
    blogId: BlogId,
    actor: Actor,
  ) {
    yield* authorize(blogId, actor, "read");
    const rows = yield* execute("mediaAsset.list", (client) =>
      client.query.mediaAsset.findMany({
        where: and(
          eq(schema.mediaAsset.blogId, blogId),
          ne(schema.mediaAsset.status, "deleted"),
        ),
        with: {
          variants: true,
          coverPosts: { columns: { id: true, title: true, slug: true } },
        },
        orderBy: [desc(schema.mediaAsset.createdAt)],
      }),
    );
    return {
      items: rows.map((row) => assetOutput(row, row.variants, row.coverPosts)),
      usage: yield* usage(blogId),
      configured: storage.configured,
      backupConfigured: storage.backupConfigured,
      maxUploadBytes: storage.maxUploadBytes,
    };
  });

  const markFailed = Effect.fn("Media.markFailed")(function* (
    assetId: MediaAssetId,
    message: string,
  ) {
    const now = new Date(yield* Clock.currentTimeMillis);
    yield* execute("mediaAsset.fail", (client) =>
      client
        .update(schema.mediaAsset)
        .set({
          status: "failed",
          failureReason: message.slice(0, 500),
          updatedAt: now,
        })
        .where(eq(schema.mediaAsset.id, assetId)),
    );
  });

  const startUpload = Effect.fn("Media.startUpload")(function* (
    input: StartUploadInput,
    actor: Actor,
  ) {
    yield* authorize(input.blogId, actor, "write");
    if (!storage.configured) {
      return yield* new ObjectStorage.NotConfigured({
        message: "Media storage is not configured for this deployment",
      });
    }
    const filename = safeFilename(input.filename);
    if (!filename) {
      return yield* new InvalidUpload({ message: "Invalid upload filename" });
    }
    const mimeType = normalizedMimeType(input.mimeType);
    if (!MediaImage.isAcceptedImageMimeType(mimeType)) {
      return yield* new InvalidUpload({
        message: "Upload a JPEG, PNG, WebP, or AVIF image",
      });
    }
    if (
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize < 1 ||
      input.byteSize > storage.maxUploadBytes
    ) {
      return yield* new InvalidUpload({
        message: `Image size must be between 1 and ${storage.maxUploadBytes} bytes`,
      });
    }

    const now = new Date(yield* Clock.currentTimeMillis);
    const expiresAt = new Date(
      now.getTime() + storage.uploadUrlExpiresSeconds * 1_000,
    );
    const assetId = MediaAssetId.make(randomUUID());
    const uploadStorageKey = `_uploads/${input.blogId}/${assetId}`;

    const reservation = yield* executeResult<
      {
        readonly usage: MediaUsage;
        readonly expiredUploadKeys: ReadonlyArray<string>;
      },
      QuotaExceeded
    >("mediaAsset.reserve", (client) =>
      client.transaction(async (tx) => {
        const [publication] = await tx
          .select()
          .from(schema.blog)
          .where(eq(schema.blog.id, input.blogId))
          .for("update");
        if (!publication) {
          return Result.fail(
            new QuotaExceeded({
              quotaBytes: 0,
              usedBytes: 0,
              requestedBytes: input.byteSize,
            }),
          );
        }
        const expired = await tx
          .select({ uploadStorageKey: schema.mediaAsset.uploadStorageKey })
          .from(schema.mediaAsset)
          .where(
            and(
              eq(schema.mediaAsset.blogId, input.blogId),
              inArray(schema.mediaAsset.status, [
                "pending",
                "failed",
                "deleted",
              ]),
              sql`${schema.mediaAsset.uploadExpiresAt} < ${now}`,
            ),
          );
        await tx
          .update(schema.mediaAsset)
          .set({
            status: "failed",
            failureReason: "Signed upload expired",
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.mediaAsset.blogId, input.blogId),
              eq(schema.mediaAsset.status, "pending"),
              sql`${schema.mediaAsset.uploadExpiresAt} < ${now}`,
            ),
          );
        const totals = await tx
          .select({
            value: sql<string>`coalesce(sum(${schema.mediaAsset.storageBytes}), 0)`,
          })
          .from(schema.mediaAsset)
          .where(activeAssetFilter(input.blogId));
        const usedBytes = Number(totals[0]?.value ?? 0);
        if (usedBytes + input.byteSize > publication.mediaStorageQuotaBytes) {
          return Result.fail(
            new QuotaExceeded({
              quotaBytes: publication.mediaStorageQuotaBytes,
              usedBytes,
              requestedBytes: input.byteSize,
            }),
          );
        }
        await tx.insert(schema.mediaAsset).values({
          id: assetId,
          blogId: input.blogId,
          originalFilename: filename,
          declaredMimeType: mimeType,
          byteSize: input.byteSize,
          storageBytes: input.byteSize,
          uploadStorageKey,
          uploadExpiresAt: expiresAt,
          createdById: actor._tag === "Dashboard" ? actor.userId : null,
        });
        await tx.insert(schema.auditLog).values({
          organizationId: publication.organizationId,
          blogId: input.blogId,
          actorId: actor._tag === "Dashboard" ? actor.userId : null,
          action: "media.upload_reserved",
          entityType: "media_asset",
          entityId: assetId,
          after: {
            source: actor._tag === "Dashboard" ? "dashboard" : "api",
            ...(actor._tag === "Api" ? { apiKeyId: actor.keyId } : {}),
            filename,
            mimeType,
            byteSize: input.byteSize,
            expiresAt,
          },
        });
        const nextUsedBytes = usedBytes + input.byteSize;
        return Result.succeed({
          usage: {
            usedBytes: nextUsedBytes,
            quotaBytes: publication.mediaStorageQuotaBytes,
            remainingBytes: publication.mediaStorageQuotaBytes - nextUsedBytes,
          },
          expiredUploadKeys: expired.map((row) => row.uploadStorageKey),
        });
      }),
    );
    yield* storage
      .delete(reservation.expiredUploadKeys)
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("Unable to remove expired media uploads", error),
        ),
      );

    const targetResult = yield* Effect.result(
      storage.createUploadTarget(uploadStorageKey, mimeType, input.byteSize),
    );
    if (Result.isFailure(targetResult)) {
      yield* markFailed(assetId, targetResult.failure.message).pipe(
        Effect.ignore,
      );
      return yield* targetResult.failure;
    }
    const target = targetResult.success;

    const asset = yield* loadAsset(input.blogId, assetId);
    return {
      asset,
      upload: {
        url: target.url,
        method: "PUT" as const,
        headers: target.headers,
        expiresAt: expiresAt.toISOString(),
      },
      usage: reservation.usage,
    } satisfies UploadReservation;
  });

  const claimUpload = Effect.fn("Media.claimUpload")(function* (
    input: CompleteUploadInput,
    actor: Actor,
  ) {
    yield* authorize(input.blogId, actor, "write");
    const now = new Date(yield* Clock.currentTimeMillis);
    return yield* executeResult<
      {
        readonly asset: AssetRow;
        readonly state: "claimed" | "expired" | "ready";
      },
      AssetNotFound | InvalidState
    >("mediaAsset.claim", (client) =>
      client.transaction(async (tx) => {
        const [asset] = await tx
          .select()
          .from(schema.mediaAsset)
          .where(
            and(
              eq(schema.mediaAsset.id, input.assetId),
              eq(schema.mediaAsset.blogId, input.blogId),
            ),
          )
          .for("update");
        if (!asset) return Result.fail(new AssetNotFound(input));
        if (asset.status === "ready") {
          return Result.succeed({ asset, state: "ready" as const });
        }
        if (asset.status !== "pending") {
          return Result.fail(
            new InvalidState({ assetId: input.assetId, status: asset.status }),
          );
        }
        if (asset.uploadExpiresAt <= now) {
          await tx
            .update(schema.mediaAsset)
            .set({
              status: "failed",
              failureReason: "Signed upload expired",
              updatedAt: now,
            })
            .where(eq(schema.mediaAsset.id, input.assetId));
          return Result.succeed({ asset, state: "expired" as const });
        }
        await tx
          .update(schema.mediaAsset)
          .set({ status: "processing", failureReason: null, updatedAt: now })
          .where(eq(schema.mediaAsset.id, input.assetId));
        return Result.succeed({ asset, state: "claimed" as const });
      }),
    );
  });

  const completeUpload = Effect.fn("Media.completeUpload")(function* (
    input: CompleteUploadInput,
    actor: Actor,
  ) {
    const claimed = yield* claimUpload(input, actor);
    if (claimed.state === "ready") {
      return yield* loadAsset(input.blogId, input.assetId);
    }
    if (claimed.state === "expired") {
      yield* storage.delete([claimed.asset.uploadStorageKey]);
      return yield* new UploadExpired({ assetId: input.assetId });
    }
    const asset = claimed.asset;
    const variantKeys: Array<string> = [];
    const completion = Effect.gen(function* () {
      const head = yield* storage.head(asset.uploadStorageKey);
      if (head.byteSize !== asset.byteSize) {
        return yield* new InvalidUpload({
          message: `Uploaded object size ${head.byteSize} does not match reserved size ${asset.byteSize}`,
        });
      }
      if (
        head.contentType &&
        normalizedMimeType(head.contentType) !== asset.declaredMimeType
      ) {
        return yield* new InvalidUpload({
          message: "Uploaded object MIME type does not match the reservation",
        });
      }
      const body = yield* storage.get(asset.uploadStorageKey);
      if (body.byteLength !== asset.byteSize) {
        return yield* new InvalidUpload({
          message: "Uploaded object changed while it was being read",
        });
      }
      const processed = yield* images.process(body, asset.declaredMimeType);
      const variants = processed.variants.map((variant) => {
        const storageKey = `publications/${input.blogId}/media/${input.assetId}/${variant.kind}-${variant.checksumSha256.slice(0, 16)}.${variant.extension}`;
        variantKeys.push(storageKey);
        return {
          ...variant,
          storageKey,
          publicUrl: storage.publicUrl(storageKey),
        };
      });
      yield* Effect.forEach(
        variants,
        (variant) =>
          storage.put(variant.storageKey, variant.mimeType, variant.body),
        { concurrency: 3, discard: true },
      );
      const backedUp = yield* storage.backup(variantKeys);
      yield* storage.delete([asset.uploadStorageKey]);
      const now = new Date(yield* Clock.currentTimeMillis);
      const storageBytes = variants.reduce(
        (total, variant) => total + variant.byteSize,
        0,
      );

      yield* executeResult<void, QuotaExceeded | AssetNotFound | InvalidState>(
        "mediaAsset.complete",
        (client) =>
          client.transaction(async (tx) => {
            const [publication] = await tx
              .select()
              .from(schema.blog)
              .where(eq(schema.blog.id, input.blogId))
              .for("update");
            if (!publication) {
              return Result.fail(
                new QuotaExceeded({
                  quotaBytes: 0,
                  usedBytes: 0,
                  requestedBytes: storageBytes,
                }),
              );
            }
            const [currentAsset] = await tx
              .select({ status: schema.mediaAsset.status })
              .from(schema.mediaAsset)
              .where(
                and(
                  eq(schema.mediaAsset.id, input.assetId),
                  eq(schema.mediaAsset.blogId, input.blogId),
                ),
              )
              .for("update");
            if (!currentAsset) {
              return Result.fail(new AssetNotFound({ assetId: input.assetId }));
            }
            if (currentAsset.status !== "processing") {
              return Result.fail(
                new InvalidState({
                  assetId: input.assetId,
                  status: currentAsset.status,
                }),
              );
            }
            const totals = await tx
              .select({
                value: sql<string>`coalesce(sum(${schema.mediaAsset.storageBytes}), 0)`,
              })
              .from(schema.mediaAsset)
              .where(
                and(
                  activeAssetFilter(input.blogId),
                  ne(schema.mediaAsset.id, input.assetId),
                ),
              );
            const usedBytes = Number(totals[0]?.value ?? 0);
            if (usedBytes + storageBytes > publication.mediaStorageQuotaBytes) {
              await tx
                .update(schema.mediaAsset)
                .set({
                  status: "failed",
                  failureReason: "Processed variants exceed the media quota",
                  updatedAt: now,
                })
                .where(eq(schema.mediaAsset.id, input.assetId));
              return Result.fail(
                new QuotaExceeded({
                  quotaBytes: publication.mediaStorageQuotaBytes,
                  usedBytes,
                  requestedBytes: storageBytes,
                }),
              );
            }
            await tx
              .delete(schema.mediaVariant)
              .where(eq(schema.mediaVariant.assetId, input.assetId));
            await tx.insert(schema.mediaVariant).values(
              variants.map((variant) => ({
                assetId: input.assetId,
                kind: variant.kind,
                storageKey: variant.storageKey,
                publicUrl: variant.publicUrl,
                mimeType: variant.mimeType,
                byteSize: variant.byteSize,
                width: variant.width,
                height: variant.height,
                checksumSha256: variant.checksumSha256,
              })),
            );
            await tx
              .update(schema.mediaAsset)
              .set({
                detectedMimeType: processed.detectedMimeType,
                byteSize: body.byteLength,
                storageBytes,
                width: processed.width,
                height: processed.height,
                checksumSha256: processed.checksumSha256,
                status: "ready",
                uploadedAt: now,
                backedUpAt: backedUp ? now : null,
                failureReason: null,
                updatedAt: now,
              })
              .where(eq(schema.mediaAsset.id, input.assetId));
            await tx.insert(schema.auditLog).values({
              organizationId: publication.organizationId,
              blogId: input.blogId,
              actorId: actor._tag === "Dashboard" ? actor.userId : null,
              action: "media.upload_completed",
              entityType: "media_asset",
              entityId: input.assetId,
              after: {
                source: actor._tag === "Dashboard" ? "dashboard" : "api",
                ...(actor._tag === "Api" ? { apiKeyId: actor.keyId } : {}),
                mimeType: processed.detectedMimeType,
                width: processed.width,
                height: processed.height,
                storageBytes,
                backedUp,
              },
            });
            return Result.succeed(undefined);
          }),
      );
      return yield* loadAsset(input.blogId, input.assetId);
    });

    const outcome = yield* Effect.result(completion);
    if (Result.isSuccess(outcome)) return outcome.success;
    yield* markFailed(
      input.assetId,
      outcome.failure instanceof Error
        ? outcome.failure.message
        : "Media processing failed",
    ).pipe(Effect.ignore);
    yield* storage
      .delete([asset.uploadStorageKey, ...variantKeys])
      .pipe(Effect.ignore);
    yield* storage.deleteBackup(variantKeys).pipe(Effect.ignore);
    return yield* outcome.failure;
  });

  const backup = Effect.fn("Media.backup")(function* (
    blogId: BlogId,
    assetId: MediaAssetId,
    actor: Actor,
  ) {
    yield* authorize(blogId, actor, "write");
    const asset = yield* execute("mediaAsset.getForBackup", (client) =>
      client.query.mediaAsset.findFirst({
        where: and(
          eq(schema.mediaAsset.id, assetId),
          eq(schema.mediaAsset.blogId, blogId),
        ),
        with: { variants: true },
      }),
    );
    if (!asset) return yield* new AssetNotFound({ assetId });
    if (asset.status !== "ready") {
      return yield* new InvalidState({ assetId, status: asset.status });
    }
    const copied = yield* storage.backup(
      asset.variants.map((variant) => variant.storageKey),
    );
    if (!copied) {
      return yield* new BackupNotConfigured({
        message: "PROSEWIRE_MEDIA_BACKUP_BUCKET is not configured",
      });
    }
    const now = new Date(yield* Clock.currentTimeMillis);
    yield* execute("mediaAsset.markBackedUp", (client) =>
      client.transaction(async (tx) => {
        const [publication] = await tx
          .select({ organizationId: schema.blog.organizationId })
          .from(schema.blog)
          .where(eq(schema.blog.id, blogId));
        await tx
          .update(schema.mediaAsset)
          .set({ backedUpAt: now, updatedAt: now })
          .where(eq(schema.mediaAsset.id, assetId));
        await tx.insert(schema.auditLog).values({
          organizationId: publication?.organizationId ?? null,
          blogId,
          actorId: actor._tag === "Dashboard" ? actor.userId : null,
          action: "media.backed_up",
          entityType: "media_asset",
          entityId: assetId,
          after: {
            source: actor._tag === "Dashboard" ? "dashboard" : "api",
            ...(actor._tag === "Api" ? { apiKeyId: actor.keyId } : {}),
            backedUpAt: now,
          },
        });
      }),
    );
    return yield* loadAsset(blogId, assetId);
  });

  const remove = Effect.fn("Media.remove")(function* (
    blogId: BlogId,
    assetId: MediaAssetId,
    actor: Actor,
  ) {
    const authorization = yield* authorize(blogId, actor, "write");
    const now = new Date(yield* Clock.currentTimeMillis);
    const keys = yield* executeResult<
      ReadonlyArray<string>,
      AssetNotFound | AssetInUse | InvalidState | BlogAccess.BlogAccessDenied
    >("mediaAsset.delete", (client) =>
      client.transaction(async (tx) => {
        const [asset] = await tx
          .select()
          .from(schema.mediaAsset)
          .where(
            and(
              eq(schema.mediaAsset.id, assetId),
              eq(schema.mediaAsset.blogId, blogId),
            ),
          )
          .for("update");
        if (!asset) return Result.fail(new AssetNotFound({ assetId }));
        if (
          asset.status === "pending" ||
          asset.status === "processing" ||
          (asset.status === "failed" && asset.uploadExpiresAt > now)
        ) {
          return Result.fail(
            new InvalidState({ assetId, status: asset.status }),
          );
        }
        const references = await tx
          .select({ id: schema.post.id })
          .from(schema.post)
          .where(eq(schema.post.coverImageAssetId, assetId));
        if (references.length > 0) {
          return Result.fail(
            new AssetInUse({ assetId, referenceCount: references.length }),
          );
        }
        if (
          actor._tag === "Dashboard" &&
          authorization &&
          !canUpdatePost(
            authorization.role,
            asset.createdById ? UserId.make(asset.createdById) : null,
            actor.userId,
          )
        ) {
          return Result.fail(
            new BlogAccess.BlogAccessDenied({
              blogId,
              userId: actor.userId,
              capability: "content:update:any",
            }),
          );
        }
        const variants = await tx
          .select({ storageKey: schema.mediaVariant.storageKey })
          .from(schema.mediaVariant)
          .where(eq(schema.mediaVariant.assetId, assetId));
        if (asset.status !== "deleted") {
          await tx
            .update(schema.mediaAsset)
            .set({ status: "deleted", deletedAt: now, updatedAt: now })
            .where(eq(schema.mediaAsset.id, assetId));
          const [publication] = await tx
            .select({ organizationId: schema.blog.organizationId })
            .from(schema.blog)
            .where(eq(schema.blog.id, blogId));
          await tx.insert(schema.auditLog).values({
            organizationId: publication?.organizationId ?? null,
            blogId,
            actorId: actor._tag === "Dashboard" ? actor.userId : null,
            action: "media.deleted",
            entityType: "media_asset",
            entityId: assetId,
            before: {
              filename: asset.originalFilename,
              status: asset.status,
              storageBytes: asset.storageBytes,
            },
            after: {
              source: actor._tag === "Dashboard" ? "dashboard" : "api",
              ...(actor._tag === "Api" ? { apiKeyId: actor.keyId } : {}),
              retainedBackup: asset.backedUpAt !== null,
            },
          });
        }
        return Result.succeed([
          asset.uploadStorageKey,
          ...variants.map((variant) => variant.storageKey),
        ]);
      }),
    );
    yield* storage.delete(keys);
    return { ok: true as const };
  });

  return {
    list,
    get: Effect.fn("Media.get")(function* (
      blogId: BlogId,
      assetId: MediaAssetId,
      actor: Actor,
    ) {
      yield* authorize(blogId, actor, "read");
      return yield* loadAsset(blogId, assetId);
    }),
    usage,
    startUpload,
    completeUpload,
    backup,
    remove,
  };
});

export type Interface = Effect.Success<ReturnType<typeof create>>;

export class Service extends Context.Service<Service, Interface>()(
  "@prosewire/web/Media",
) {}

export const layer = Layer.effect(
  Service,
  create().pipe(Effect.map(Service.of)),
);

export const live = layer.pipe(
  Layer.provideMerge(ObjectStorage.layer),
  Layer.provideMerge(MediaImage.layer),
);

export * as Media from "./media";
