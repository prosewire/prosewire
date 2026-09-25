import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BlogAccess } from "./authorization.ts";
import type { BlogAuthorization } from "./authorization-models.ts";
import { databaseLayer, databaseUrl } from "./database-test-support.ts";
import {
  ApiKeyId,
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
  readonly uploadKey: (url: string) => string;
}

function memoryStorage(): MemoryStorage {
  const objects = new Map<
    string,
    { readonly body: Uint8Array; readonly mimeType: string }
  >();
  const missing = (operation: string, key: string) =>
    new ObjectStorage.StorageError({
      operation,
      cause: new Error(`Missing object ${key}`),
    });
  return {
    objects,
    uploadKey: (url) => decodeURIComponent(new URL(url).pathname.slice(1)),
    service: {
      configured: true,
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
      deletePrefix: (prefix) =>
        Effect.sync(() => {
          for (const key of objects.keys())
            if (key.startsWith(prefix)) objects.delete(key);
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
  cachedAuthorization?: BlogAuthorization,
) {
  const database = databaseLayer(client);
  const dependencies = Layer.mergeAll(
    database,
    cachedAuthorization
      ? Layer.mock(BlogAccess.Service, {
          requirePostCreate: () => Effect.succeed(cachedAuthorization),
        })
      : BlogAccess.layer.pipe(Layer.provide(database)),
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
  it("processes, protects references, deletes, and releases quota", async () => {
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
      });
      expect(asset.variants.map(({ kind }) => kind)).toEqual([
        "original",
        "large",
        "thumbnail",
      ]);
      expect(storage.objects.size).toBe(3);

      const keyId = ApiKeyId.make(randomUUID());
      const apiActor = { _tag: "Api" as const, keyId };
      const uploadInput = new StartUploadInput({
        blogId,
        filename: "revocation.png",
        mimeType: "image/png",
        byteSize: body.byteLength,
      });
      await resource.client.insert(schema.apiKey).values({
        id: keyId,
        blogId,
        name: "Media writer",
        prefix: "pw_test",
        keyHash: randomUUID(),
        scopes: ["content:write"],
        expiresAt: new Date(0),
      });
      const expired = await Effect.runPromise(
        Effect.flip(service.startUpload(uploadInput, apiActor)),
      );
      expect(expired._tag).toBe("ApiAuthenticationFailed");
      await resource.client
        .update(schema.apiKey)
        .set({ expiresAt: null, scopes: ["content:read"] })
        .where(eq(schema.apiKey.id, keyId));
      const deniedClaim = await Effect.runPromise(
        Effect.flip(
          service.completeUpload(
            new CompleteUploadInput({ blogId, assetId: asset.id }),
            apiActor,
          ),
        ),
      );
      const deniedRemoval = await Effect.runPromise(
        Effect.flip(service.remove(blogId, asset.id, apiActor)),
      );
      expect(deniedClaim._tag).toBe("ApiScopeDenied");
      expect(deniedRemoval._tag).toBe("ApiScopeDenied");
      await resource.client
        .update(schema.apiKey)
        .set({ scopes: ["content:write"] })
        .where(eq(schema.apiKey.id, keyId));
      const revocation = await Effect.runPromise(
        service.startUpload(uploadInput, apiActor),
      );
      storage.objects.set(storage.uploadKey(revocation.upload.url), {
        body,
        mimeType: "image/png",
      });
      const revokingService = await mediaService(resource.client, {
        ...storage.service,
        put: (key, mimeType, bytes) =>
          storage.service
            .put(key, mimeType, bytes)
            .pipe(
              Effect.andThen(
                Effect.promise(() =>
                  resource.client
                    .delete(schema.apiKey)
                    .where(eq(schema.apiKey.id, keyId)),
                ),
              ),
            ),
      });
      const revokedCompletion = await Effect.runPromise(
        Effect.flip(
          revokingService.completeUpload(
            new CompleteUploadInput({ blogId, assetId: revocation.asset.id }),
            apiActor,
          ),
        ),
      );
      expect(revokedCompletion._tag).toBe("ApiAuthenticationFailed");
      const rejectedAsset = await resource.client.query.mediaAsset.findFirst({
        where: eq(schema.mediaAsset.id, revocation.asset.id),
        with: { variants: true },
      });
      expect(rejectedAsset?.status).toBe("failed");
      expect(rejectedAsset?.variants).toHaveLength(0);
      expect(storage.objects.size).toBe(3);
      expect(
        (
          await Effect.runPromise(
            Effect.flip(service.startUpload(uploadInput, apiActor)),
          )
        )._tag,
      ).toBe("ApiAuthenticationFailed");

      const cachedAuthorization = await Effect.runPromise(
        Effect.flatMap(BlogAccess.Service, (access) =>
          access.requirePostCreate(blogId, ownerId),
        ).pipe(
          Effect.provide(
            BlogAccess.layer.pipe(
              Layer.provide(databaseLayer(resource.client)),
            ),
          ),
        ),
      );
      await resource.client
        .update(schema.member)
        .set({ role: "viewer" })
        .where(eq(schema.member.userId, ownerId));
      const staleService = await mediaService(
        resource.client,
        storage.service,
        cachedAuthorization,
      );
      expect(
        (
          await Effect.runPromise(
            Effect.flip(staleService.remove(blogId, asset.id, actor)),
          )
        )._tag,
      ).toBe("BlogAccessDenied");
      expect(storage.objects.size).toBe(3);
      await resource.client
        .update(schema.member)
        .set({ role: "owner" })
        .where(eq(schema.member.userId, ownerId));

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
      await expect(
        Effect.runPromise(service.list(blogId, actor)),
      ).resolves.toMatchObject({
        items: [{ id: revocation.asset.id, status: "failed" }],
        usage: { usedBytes: 0 },
      });
      const audits = await resource.client.query.auditLog.findMany({
        columns: { action: true },
        where: eq(schema.auditLog.blogId, blogId),
      });
      expect(audits.map(({ action }) => action).sort()).toEqual([
        "media.deleted",
        "media.upload_completed",
        "media.upload_reserved",
        "media.upload_reserved",
      ]);

      for (const recoverBy of ["complete", "remove"] as const) {
        const abandonedId = MediaAssetId.make(randomUUID());
        const abandonedKey = `publications/${blogId}/media/${abandonedId}/original-orphan.png`;
        await resource.client.insert(schema.mediaAsset).values({
          id: abandonedId,
          blogId,
          originalFilename: "abandoned.png",
          declaredMimeType: "image/png",
          byteSize: 1,
          storageBytes: 1,
          uploadStorageKey: `_uploads/${blogId}/${abandonedId}`,
          uploadExpiresAt: new Date(0),
          status: "processing",
          updatedAt: new Date(0),
          createdById: ownerId,
        });
        storage.objects.set(abandonedKey, {
          body: new Uint8Array([1]),
          mimeType: "image/png",
        });
        if (recoverBy === "complete") {
          const failure = await Effect.runPromise(
            Effect.flip(
              service.completeUpload(
                new CompleteUploadInput({ blogId, assetId: abandonedId }),
                actor,
              ),
            ),
          );
          expect(failure._tag).toBe("MediaUploadExpired");
        } else {
          await Effect.runPromise(service.remove(blogId, abandonedId, actor));
        }
        expect(storage.objects.has(abandonedKey)).toBe(false);
        const recovered = await resource.client.query.mediaAsset.findFirst({
          where: eq(schema.mediaAsset.id, abandonedId),
        });
        expect(recovered?.status).toBe(
          recoverBy === "complete" ? "failed" : "deleted",
        );
      }

      const tinyBody = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      await resource.client
        .update(schema.blog)
        .set({ mediaStorageQuotaBytes: tinyBody.byteLength })
        .where(eq(schema.blog.id, blogId));
      const overQuota = await Effect.runPromise(
        service.startUpload(
          new StartUploadInput({
            blogId,
            filename: "quota.png",
            mimeType: "image/png",
            byteSize: tinyBody.byteLength,
          }),
          actor,
        ),
      );
      storage.objects.set(storage.uploadKey(overQuota.upload.url), {
        body: tinyBody,
        mimeType: "image/png",
      });
      const completionQuota = await Effect.runPromise(
        Effect.flip(
          service.completeUpload(
            new CompleteUploadInput({ blogId, assetId: overQuota.asset.id }),
            actor,
          ),
        ),
      );
      expect(completionQuota._tag).toBe("MediaQuotaExceeded");
      expect(storage.objects.size).toBe(0);
      const failedQuota = await resource.client.query.mediaAsset.findFirst({
        where: eq(schema.mediaAsset.id, overQuota.asset.id),
      });
      expect(failedQuota?.status).toBe("failed");

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
