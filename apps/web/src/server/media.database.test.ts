import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BlogAccess } from "./authorization.ts";
import { databaseLayer, databaseUrl } from "./database-test-support.ts";
import {
  AuthorId,
  BlogId,
  MediaAssetId,
  OrganizationId,
  PostId,
  UserId,
} from "./domain.ts";
import { CompleteUploadInput, Media, StartUploadInput } from "./media.ts";
import { MediaImage } from "./media-image.ts";
import { ObjectStorage } from "./object-storage.ts";

interface MemoryStorage {
  readonly service: ObjectStorage.Shape;
  readonly objects: Map<
    string,
    { readonly body: Uint8Array; readonly mimeType: string }
  >;
  readonly backups: Map<string, Uint8Array>;
  readonly uploadKey: (url: string) => string;
}

function memoryStorage(): MemoryStorage {
  const objects = new Map<
    string,
    { readonly body: Uint8Array; readonly mimeType: string }
  >();
  const backups = new Map<string, Uint8Array>();
  const missing = (operation: string, key: string) =>
    new ObjectStorage.StorageError({
      operation,
      cause: new Error(`Missing object ${key}`),
    });
  return {
    objects,
    backups,
    uploadKey: (url) => decodeURIComponent(new URL(url).pathname.slice(1)),
    service: {
      configured: true,
      backupConfigured: true,
      maxUploadBytes: 20 * 1_024 * 1_024,
      uploadUrlExpiresSeconds: 600,
      publicUrl: (key) => `https://media.example/${encodeURIComponent(key)}`,
      createUploadTarget: (key, contentType) =>
        Effect.succeed({
          url: `https://uploads.example/${encodeURIComponent(key)}`,
          headers: { "content-type": contentType },
        }),
      head: (key) => {
        const object = objects.get(key);
        return object
          ? Effect.succeed({
              byteSize: object.body.byteLength,
              contentType: object.mimeType,
            })
          : Effect.fail(missing("head", key));
      },
      get: (key) => {
        const object = objects.get(key);
        return object
          ? Effect.succeed(object.body)
          : Effect.fail(missing("get", key));
      },
      put: (key, mimeType, body) =>
        Effect.sync(() => {
          objects.set(key, { body, mimeType });
        }),
      backup: (keys) =>
        Effect.sync(() => {
          for (const key of keys) {
            const object = objects.get(key);
            if (!object) throw missing("backup", key);
            backups.set(key, object.body);
          }
          return true;
        }),
      deleteBackup: (keys) =>
        Effect.sync(() => {
          for (const key of keys) backups.delete(key);
        }),
      delete: (keys) =>
        Effect.sync(() => {
          for (const key of keys) objects.delete(key);
        }),
    },
  };
}

async function mediaService(
  client: ReturnType<typeof openDb>["client"],
  storage: ObjectStorage.Shape,
) {
  const database = databaseLayer(client);
  const dependencies = Layer.mergeAll(
    database,
    BlogAccess.layer.pipe(Layer.provide(database)),
    Layer.succeed(ObjectStorage.Service, storage),
    MediaImage.layer,
  );
  return Effect.runPromise(
    Media.Service.pipe(
      Effect.provide(Media.layer.pipe(Layer.provide(dependencies))),
    ),
  );
}

describe.skipIf(!databaseUrl)("PostgreSQL media lifecycle", () => {
  it("processes, backs up, protects references, deletes, and releases quota", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const ownerId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const authorId = AuthorId.make(randomUUID());
    const postId = PostId.make(randomUUID());
    const storage = memoryStorage();

    try {
      await resource.client.insert(schema.user).values({
        id: ownerId,
        email: `${randomUUID()}@example.com`,
        name: "Media owner",
      });
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Media workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values({
        id: `member-${randomUUID()}`,
        organizationId,
        userId: ownerId,
        role: "owner",
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "Media publication",
        slug: `blog-${randomUUID()}`,
        mediaStorageQuotaBytes: 10 * 1_024 * 1_024,
      });
      await resource.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "Media owner",
        slug: `author-${randomUUID()}`,
        userId: ownerId,
      });

      const service = await mediaService(resource.client, storage.service);
      const actor = { _tag: "Dashboard" as const, userId: ownerId };
      const body = await sharp({
        create: {
          width: 800,
          height: 400,
          channels: 4,
          background: { r: 239, g: 104, b: 72, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      const reservation = await Effect.runPromise(
        service.startUpload(
          new StartUploadInput({
            blogId,
            filename: "cover.png",
            mimeType: "image/png",
            byteSize: body.byteLength,
          }),
          actor,
        ),
      );
      const pendingRemoval = await Effect.runPromise(
        Effect.flip(service.remove(blogId, reservation.asset.id, actor)),
      );
      expect(pendingRemoval).toMatchObject({
        _tag: "MediaInvalidState",
        status: "pending",
      });
      storage.objects.set(storage.uploadKey(reservation.upload.url), {
        body,
        mimeType: "image/png",
      });

      const asset = await Effect.runPromise(
        service.completeUpload(
          new CompleteUploadInput({
            blogId,
            assetId: MediaAssetId.make(reservation.asset.id),
          }),
          actor,
        ),
      );

      expect(asset).toMatchObject({
        status: "ready",
        mimeType: "image/png",
        width: 800,
        height: 400,
        backedUpAt: expect.any(String),
      });
      expect(asset.variants.map(({ kind }) => kind)).toEqual([
        "original",
        "large",
        "thumbnail",
      ]);
      expect(storage.objects.size).toBe(3);
      expect(storage.backups.size).toBe(3);

      await Effect.runPromise(service.backup(blogId, asset.id, actor));
      await resource.client.insert(schema.post).values({
        id: postId,
        blogId,
        authorId,
        title: "Managed cover",
        slug: "managed-cover",
        coverImageAssetId: asset.id,
        coverImageUrl: asset.url,
      });
      const inUse = await Effect.runPromise(
        Effect.flip(service.remove(blogId, asset.id, actor)),
      );
      expect(inUse).toMatchObject({
        _tag: "MediaAssetInUse",
        referenceCount: 1,
      });

      await resource.client
        .update(schema.post)
        .set({ coverImageAssetId: null, coverImageUrl: null })
        .where(eq(schema.post.id, postId));
      await Effect.runPromise(service.remove(blogId, asset.id, actor));

      expect(storage.objects.size).toBe(0);
      expect(storage.backups.size).toBe(3);
      await expect(
        Effect.runPromise(service.list(blogId, actor)),
      ).resolves.toMatchObject({
        items: [],
        usage: { usedBytes: 0 },
      });
      const audits = await resource.client.query.auditLog.findMany({
        columns: { action: true },
        where: eq(schema.auditLog.blogId, blogId),
      });
      expect(audits.map(({ action }) => action).sort()).toEqual([
        "media.backed_up",
        "media.deleted",
        "media.upload_completed",
        "media.upload_reserved",
      ]);

      await resource.client
        .update(schema.blog)
        .set({ mediaStorageQuotaBytes: 1 })
        .where(eq(schema.blog.id, blogId));
      const quota = await Effect.runPromise(
        Effect.flip(
          service.startUpload(
            new StartUploadInput({
              blogId,
              filename: "too-large.png",
              mimeType: "image/png",
              byteSize: body.byteLength,
            }),
            actor,
          ),
        ),
      );
      expect(quota._tag).toBe("MediaQuotaExceeded");
    } finally {
      await resource.client
        .delete(schema.auditLog)
        .where(eq(schema.auditLog.organizationId, organizationId));
      await resource.client
        .delete(schema.organization)
        .where(eq(schema.organization.id, organizationId));
      await resource.client
        .delete(schema.user)
        .where(eq(schema.user.id, ownerId));
      await resource.close();
    }
  });
});
