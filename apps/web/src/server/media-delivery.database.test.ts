import { randomUUID } from "node:crypto";
import * as schema from "@prosewire/db/schema";
import { openTestDatabase } from "@prosewire/db/testing";
import { eq } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import { describe, expect, it } from "vitest";
import { BlogAccess } from "./authorization.ts";
import { WebConfig } from "./config.ts";
import { databaseLayer, databaseUrl } from "./database-test-support.ts";
import { UserId } from "./domain.ts";
import { MediaDelivery } from "./media-delivery.ts";
import { ObjectStorage } from "./object-storage.ts";

describe.skipIf(!databaseUrl)("private media visibility", () => {
  it("protects unpublished assets and tenant boundaries while allowing published and member previews", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL required");
    const database = await openTestDatabase(databaseUrl, "media_delivery");
    const db = database.client;
    const owner = UserId.make("owner"),
      outsider = UserId.make("outsider");
    const blogId = randomUUID(),
      otherBlog = randomUUID(),
      assetId = randomUUID(),
      authorId = randomUUID(),
      postId = randomUUID();
    const key = `publications/${blogId}/media/${assetId}/large-abc.webp`;
    const publicUrl = `https://cloud.example.com/media/${key}`;
    const databaseService = databaseLayer(db);
    const runtime = ManagedRuntime.make(
      MediaDelivery.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            databaseService,
            BlogAccess.layer.pipe(Layer.provide(databaseService)),
            Layer.succeed(WebConfig, {
              defaultBlog: "test",
              publicUrl: "https://cloud.example.com",
              databaseUrl: Redacted.make(database.url),
              authSecret: Redacted.make("test-secret-at-least-32-characters"),
              allowSignUp: false,
              deployment: "cloud",
              environment: "test",
              mediaStorage: {
                delivery: "signed",
                endpoint: "https://storage.example.com",
                region: "auto",
                bucket: "media",
                accessKeyId: Redacted.make("test"),
                secretAccessKey: Redacted.make("test"),
                publicUrl: "https://cloud.example.com/media",
                forcePathStyle: false,
                maxUploadBytes: 100,
                uploadUrlExpiresSeconds: 600,
              },
            }),
            Layer.succeed(ObjectStorage.Service, {
              ...ObjectStorage.disabled,
              configured: true,
              signedReadUrl: () =>
                Effect.succeed("https://storage.example.com/signed"),
            }),
          ),
        ),
      ),
    );
    const resolve = (reader?: UserId, target = key) =>
      runtime.runPromise(
        Effect.flatMap(MediaDelivery.Service, (delivery) =>
          delivery.resolve(target, Effect.succeed(reader ?? null)),
        ),
      );
    const change = (values: Partial<typeof schema.post.$inferInsert>) =>
      db.update(schema.post).set(values).where(eq(schema.post.id, postId));
    try {
      await db.insert(schema.user).values([
        { id: owner, name: "Owner", email: "owner@example.com" },
        { id: outsider, name: "Outsider", email: "outsider@example.com" },
      ]);
      await db
        .insert(schema.organization)
        .values({ id: "org", name: "Test", slug: "test" });
      await db.insert(schema.member).values({
        id: "member",
        userId: owner,
        organizationId: "org",
        role: "owner",
      });
      await db.insert(schema.blog).values([
        { id: blogId, organizationId: "org", name: "Test", slug: "test" },
        { id: otherBlog, organizationId: "org", name: "Other", slug: "other" },
      ]);
      await db
        .insert(schema.author)
        .values({ id: authorId, blogId, name: "Test", slug: "test" });
      await db.insert(schema.mediaAsset).values({
        id: assetId,
        blogId,
        status: "ready",
        originalFilename: "image.webp",
        declaredMimeType: "image/webp",
        byteSize: 10,
        storageBytes: 10,
        uploadStorageKey: "_uploads/raw",
        uploadExpiresAt: new Date("2020-01-01"),
      });
      await db.insert(schema.mediaVariant).values({
        assetId,
        kind: "large",
        storageKey: key,
        publicUrl,
        mimeType: "image/webp",
        byteSize: 10,
        width: 1,
        height: 1,
        checksumSha256: "abc",
      });
      await db.insert(schema.post).values({
        id: postId,
        blogId,
        authorId,
        title: "Test",
        slug: "test",
        coverImageAssetId: assetId,
      });
      expect(await resolve()).toBeNull();
      expect(await resolve(outsider)).toBeNull();
      expect(await resolve(owner)).not.toBeNull();
      expect(await resolve(owner, "_uploads/raw")).toBeNull();
      expect(await resolve(owner, "unknown")).toBeNull();
      await change({
        status: "scheduled",
        scheduledAt: new Date("2099-01-01"),
      });
      expect(await resolve()).toBeNull();
      await change({
        status: "published",
        publishedAt: new Date("2099-01-01"),
      });
      expect(await resolve()).toBeNull();
      await change({ publishedAt: new Date("2020-01-01") });
      expect(await resolve()).not.toBeNull();
      let identified = false;
      await runtime.runPromise(
        Effect.flatMap(MediaDelivery.Service, (delivery) =>
          delivery.resolve(
            key,
            Effect.sync(() => {
              identified = true;
              return owner;
            }),
          ),
        ),
      );
      expect(identified).toBe(false);
      await change({ status: "archived", archivedAt: new Date("2020-01-02") });
      expect(await resolve()).toBeNull();
      expect(await resolve(owner)).not.toBeNull();
      await change({
        status: "published",
        archivedAt: null,
        coverImageAssetId: null,
        contentMarkdown: `![image](${publicUrl})`,
      });
      expect(await resolve()).not.toBeNull();
      await change({ contentMarkdown: "" });
      await db.insert(schema.author).values({
        id: "00000000-0000-4000-8000-000000000001",
        blogId: otherBlog,
        name: "Other",
        slug: "other",
      });
      await db.insert(schema.post).values({
        blogId: otherBlog,
        authorId: "00000000-0000-4000-8000-000000000001",
        title: "Other",
        slug: "other",
        status: "published",
        publishedAt: new Date("2020-01-01"),
        contentMarkdown: publicUrl,
      });
      expect(await resolve()).toBeNull();
      for (const status of ["failed", "deleted"] as const) {
        await db
          .update(schema.mediaAsset)
          .set({ status })
          .where(eq(schema.mediaAsset.id, assetId));
        expect(await resolve(owner)).toBeNull();
      }
    } finally {
      await runtime.dispose();
      await database.close();
    }
  });
});
