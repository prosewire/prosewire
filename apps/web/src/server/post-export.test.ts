import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { strFromU8, unzipSync } from "fflate";
import { BlogAccess } from "./authorization.ts";
import { BlogAuthorization } from "./authorization-models.ts";
import { ContentQueries } from "./content-queries.ts";
import {
  testAuthor,
  testBlog,
  testBlogId,
  testCategory,
  testDashboardPost,
  testDashboardPostDetail,
  testMemberId,
  testPostId,
  testRedirect,
  testSnippet,
  testWorkspace,
} from "./content-test-fixtures.ts";
import { BlogSlug, UserId } from "./domain.ts";
import { ObjectStorage } from "./object-storage.ts";
import { PostExport } from "./post-export.ts";

const mediaBody = new Uint8Array([1, 2, 3, 4]);
const mediaAssetId = "88888888-8888-4888-8888-888888888888";
const mediaStorageKey = `publications/${testBlogId}/media/${mediaAssetId}/original-test.webp`;
const mediaAsset = {
  id: mediaAssetId,
  blogId: testBlogId,
  originalFilename: "cover.webp",
  declaredMimeType: "image/webp",
  detectedMimeType: "image/webp",
  byteSize: mediaBody.byteLength,
  storageBytes: mediaBody.byteLength,
  width: 10,
  height: 5,
  checksumSha256:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  status: "ready" as const,
  uploadStorageKey: "uploads/complete",
  failureReason: null,
  createdById: null,
  uploadExpiresAt: new Date("2026-08-20T00:10:00.000Z"),
  uploadedAt: new Date("2026-08-20T00:00:00.000Z"),
  backedUpAt: null,
  deletedAt: null,
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  updatedAt: new Date("2026-08-20T00:00:00.000Z"),
  variants: [
    {
      assetId: mediaAssetId,
      kind: "original" as const,
      storageKey: mediaStorageKey,
      publicUrl: "https://media.example/cover.webp",
      mimeType: "image/webp",
      byteSize: mediaBody.byteLength,
      width: 10,
      height: 5,
      checksumSha256:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
    },
  ],
  coverPosts: [
    { id: testPostId, title: "Effect, properly", slug: "effect-properly" },
  ],
};

const contentLayer = Layer.mock(ContentQueries.Service, {
  getPublicBlog: () => Effect.succeed(testBlog),
  getDashboardPosts: () => Effect.succeed([testDashboardPost]),
  getDashboardPost: () => Effect.succeed(testDashboardPostDetail),
  getContentLibrary: () =>
    Effect.succeed({
      authors: [testAuthor],
      categories: [testCategory],
      snippets: [testSnippet],
      redirects: [testRedirect],
    }),
  getMediaExport: () => Effect.succeed([mediaAsset]),
});

const accessLayer = Layer.mock(BlogAccess.Service, {
  requireRead: () =>
    Effect.succeed(
      new BlogAuthorization({
        workspace: testWorkspace,
        blog: testBlog,
        memberId: testMemberId,
        role: "viewer",
      }),
    ),
});

const testLayer = PostExport.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      contentLayer,
      accessLayer,
      Layer.succeed(ObjectStorage.Service, ObjectStorage.disabled),
    ),
  ),
);

const mediaTestLayer = PostExport.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      contentLayer,
      accessLayer,
      Layer.succeed(ObjectStorage.Service, {
        ...ObjectStorage.disabled,
        configured: true,
        get: (key) =>
          key === mediaStorageKey
            ? Effect.succeed(mediaBody)
            : Effect.die(new Error(`Unexpected key ${key}`)),
      }),
    ),
  ),
);

describe("PostExport", () => {
  it.effect("returns a transport-neutral CSV file", () =>
    Effect.gen(function* () {
      const service = yield* PostExport.Service;
      const file = yield* service.csv(
        new PostExport.Input({
          blogSlug: BlogSlug.make("fieldnotes"),
          actorId: UserId.make("user-1"),
        }),
      );

      expect(file.filename).toBe("fieldnotes-posts.csv");
      expect(file.contentType).toBe("text/csv; charset=utf-8");
      expect(file.body).toContain('"\'=IMPORTXML unsafe title"');
      expect(file).not.toHaveProperty("status");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("returns a versioned portable export with revisions", () =>
    Effect.gen(function* () {
      const service = yield* PostExport.Service;
      const file = yield* service.portable(
        new PostExport.Input({
          blogSlug: BlogSlug.make("fieldnotes"),
          actorId: UserId.make("user-1"),
        }),
      );
      const body = JSON.parse(file.body) as {
        format: string;
        version: number;
        posts: Array<{ revisions: Array<{ version: number }> }>;
      };

      expect(file.filename).toBe("fieldnotes-prosewire-export.json");
      expect(body).toMatchObject({
        format: "prosewire-portable-export",
        version: 2,
      });
      expect(body.posts[0]?.revisions[0]?.version).toBe(1);
      expect(body).toMatchObject({
        mediaAssets: [
          {
            id: mediaAssetId,
            variants: [{ kind: "original" }],
            references: [{ postId: testPostId }],
          },
        ],
      });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("exports sanitized originals with a checksum manifest", () =>
    Effect.gen(function* () {
      const service = yield* PostExport.Service;
      const file = yield* service.media(
        new PostExport.Input({
          blogSlug: BlogSlug.make("fieldnotes"),
          actorId: UserId.make("user-1"),
        }),
      );
      const files = unzipSync(file.body);
      const manifest = JSON.parse(
        strFromU8(files["manifest.json"] ?? new Uint8Array()),
      ) as {
        format: string;
        assets: Array<{ id: string; sourcePath: string }>;
      };

      expect(file.filename).toBe("fieldnotes-prosewire-media.zip");
      expect(file.contentType).toBe("application/zip");
      expect(manifest).toMatchObject({
        format: "prosewire-media-export",
        assets: [
          {
            id: mediaAssetId,
            sourcePath: `assets/${mediaAssetId}/original.webp`,
          },
        ],
      });
      expect(files[`assets/${mediaAssetId}/original.webp`]).toEqual(mediaBody);
    }).pipe(Effect.provide(mediaTestLayer)),
  );
});
