import { createHash, randomUUID } from "node:crypto";
import { ApiImportConflict, ApiImportRejected } from "@prosewire/contract";
import * as schema from "@prosewire/db/schema";
import { openTestDatabase, type TestDatabase } from "@prosewire/db/testing";
import { and, eq, sql } from "drizzle-orm";
import { Effect, Layer, Stream } from "effect";
import { strToU8, unzipSync, zipSync } from "fflate";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApiAccess } from "./api-access.ts";
import { BlogAccess } from "./authorization.ts";
import { ContentQueries } from "./content-queries.ts";
import { databaseLayer, databaseUrl } from "./database-test-support.ts";
import { ApiKeyId, BlogId, BlogSlug, UserId } from "./domain.ts";
import { receiveImport } from "./import-files.ts";
import { MediaImage } from "./media-image.ts";
import { ObjectStorage } from "./object-storage.ts";
import { PortableImport } from "./portable-import.ts";
import { Input, PostExport } from "./post-export.ts";

const hash = (body: Uint8Array) =>
  createHash("sha256").update(body).digest("hex");
function readable(body: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });
}

const lifecycleDates = {
  draft: {},
  scheduled: { scheduledAt: new Date("2027-01-01") },
  published: { publishedAt: new Date("2024-02-03") },
  archived: { archivedAt: new Date("2025-01-01") },
};
describe.skipIf(!databaseUrl)("atomic portable publication import", () => {
  let database: TestDatabase;
  const objects = new Map<string, Uint8Array>();
  let beforePut: (() => Promise<void>) | undefined;
  const storage: ObjectStorage.Shape = {
    ...ObjectStorage.disabled,
    configured: true,
    maxUploadBytes: 20 * 1_024 * 1_024,
    publicUrl: (key) => `https://media.test/${key}`,
    put: (key, _type, body) =>
      Effect.promise(async () => {
        await beforePut?.();
        objects.set(key, body);
      }),
    delete: (keys) =>
      Effect.sync(() => {
        for (const key of keys) objects.delete(key);
      }),
    getStream: (key) => Stream.make(objects.get(key) ?? new Uint8Array()),
  };
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL required");
    database = await openTestDatabase(databaseUrl, "portable_import");
  }, 30_000);
  beforeEach(async () => {
    await database.reset();
    objects.clear();
    beforePut = undefined;
  });
  afterAll(async () => {
    await database?.close();
  });

  function postMedia(mediaId: string | undefined) {
    if (!mediaId) return {};
    return {
      coverImageAssetId: mediaId,
      coverImageUrl: storage.publicUrl(`source/${mediaId}/original.png`),
      coverImageAlt: "Cover",
    };
  }
  async function fixture(withMedia = false) {
    const client = database.client;
    const actorId = UserId.make(`import-user-${randomUUID()}`);
    const sourceId = BlogId.make(randomUUID());
    const targetId = BlogId.make(randomUUID());
    const foreignId = BlogId.make(randomUUID());
    const sourceSlug = BlogSlug.make(`source-${randomUUID()}`);
    const targetSlug = BlogSlug.make(`target-${randomUUID()}`);
    const keyId = ApiKeyId.make(randomUUID());
    await client.insert(schema.user).values({
      id: actorId,
      name: "Owner",
      email: `${randomUUID()}@test.example`,
    });
    await client.insert(schema.organization).values({
      id: "import-workspace",
      name: "Import team",
      slug: "import-team",
    });
    await client.insert(schema.member).values({
      id: "import-member",
      organizationId: "import-workspace",
      userId: actorId,
      role: "owner",
    });
    await client.insert(schema.blog).values([
      {
        id: sourceId,
        name: "Source",
        slug: sourceSlug,
        organizationId: "import-workspace",
      },
      {
        id: targetId,
        name: "Destination",
        slug: targetSlug,
        organizationId: "import-workspace",
      },
      {
        id: foreignId,
        name: "Other",
        slug: `other-${randomUUID()}`,
        organizationId: "import-workspace",
      },
    ]);
    await client.insert(schema.apiKey).values({
      id: keyId,
      blogId: targetId,
      name: "Import key",
      prefix: "pw",
      keyHash: randomUUID(),
      scopes: ["content:read", "content:write"],
    });
    const principal = new ApiAccess.Principal({
      blogId: targetId,
      keyId,
      scopes: ["content:write"],
    });
    const [author] = await client
      .insert(schema.author)
      .values({
        blogId: sourceId,
        name: "Zoë",
        slug: "zoe",
        userId: actorId,
        bio: "Editor",
        credentials: "PhD",
      })
      .returning();
    const [category] = await client
      .insert(schema.category)
      .values({
        blogId: sourceId,
        name: "News",
        slug: "news",
        description: "Reports",
      })
      .returning();
    if (!author || !category) throw new Error("Fixture failed");
    await client.insert(schema.snippet).values({
      blogId: sourceId,
      name: "Footer",
      key: "footer",
      contentMarkdown: "Thank you.",
    });
    let mediaId: string | undefined;
    let mediaArchive: Uint8Array | undefined;
    if (withMedia) {
      const body = await sharp({
        create: { width: 8, height: 4, channels: 3, background: "#ef6848" },
      })
        .png()
        .toBuffer();
      mediaId = randomUUID();
      const key = `source/${mediaId}/original.png`;
      objects.set(key, body);
      await client.insert(schema.mediaAsset).values({
        id: mediaId,
        blogId: sourceId,
        originalFilename: "cover.png",
        declaredMimeType: "image/png",
        detectedMimeType: "image/png",
        byteSize: body.length,
        storageBytes: body.length,
        width: 8,
        height: 4,
        checksumSha256: hash(body),
        status: "ready",
        uploadStorageKey: `uploads/${mediaId}`,
        uploadExpiresAt: new Date("2026-01-01"),
        uploadedAt: new Date("2026-01-01"),
      });
      await client.insert(schema.mediaVariant).values({
        assetId: mediaId,
        kind: "original",
        storageKey: key,
        publicUrl: storage.publicUrl(key),
        mimeType: "image/png",
        byteSize: body.length,
        width: 8,
        height: 4,
        checksumSha256: hash(body),
      });
      mediaArchive = zipSync({
        "manifest.json": strToU8(
          JSON.stringify({
            format: "prosewire-media-export",
            version: 1,
            publication: { id: sourceId },
            assets: [
              { id: mediaId, sourcePath: `assets/${mediaId}/original.png` },
            ],
          }),
        ),
        [`assets/${mediaId}/original.png`]: body,
      });
    }
    for (const status of [
      "draft",
      "scheduled",
      "published",
      "archived",
    ] as const) {
      const [post] = await client
        .insert(schema.post)
        .values({
          blogId: sourceId,
          authorId: author.id,
          title: `${status} title`,
          slug: status,
          contentMarkdown: `## ${status}\n\nText`,
          contentHtml: `<h2>${status}</h2>\n<p>Text</p>`,
          excerpt: "Excerpt",
          status,
          ...lifecycleDates[status],
          ...postMedia(mediaId),
          createdById: actorId,
          updatedById: actorId,
        })
        .returning();
      if (!post) throw new Error("Post fixture failed");
      await client
        .insert(schema.postCategory)
        .values({ postId: post.id, blogId: sourceId, categoryId: category.id });
      if (status === "published") {
        const {
          id: _id,
          blogId: _blogId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          createdById: _createdById,
          updatedById: _updatedById,
          ...snapshot
        } = post;
        await client.insert(schema.postRevision).values({
          postId: post.id,
          editorId: actorId,
          version: 3,
          snapshot: { ...snapshot, categoryIds: [category.id] },
        });
        await client.insert(schema.redirect).values({
          blogId: sourceId,
          fromPath: "old-published",
          toPath: "published",
        });
      }
    }
    const dbLayer = databaseLayer(client);
    const storageLayer = Layer.succeed(ObjectStorage.Service, storage);
    const dependencies = Layer.mergeAll(
      ContentQueries.layer,
      BlogAccess.layer,
    ).pipe(Layer.provideMerge(dbLayer));
    const exporter = await Effect.runPromise(
      PostExport.Service.pipe(
        Effect.provide(
          PostExport.layer.pipe(
            Layer.provide(Layer.mergeAll(dependencies, storageLayer)),
          ),
        ),
      ),
    );
    const importer = await Effect.runPromise(
      PortableImport.Service.pipe(
        Effect.provide(
          PortableImport.layer.pipe(
            Layer.provide(
              Layer.mergeAll(dbLayer, storageLayer, MediaImage.layer),
            ),
          ),
        ),
      ),
    );
    const exportJson = async (slug: BlogSlug) => {
      const artifact = await Effect.runPromise(
        exporter.portable(new Input({ blogSlug: slug, actorId })),
      );
      return Buffer.concat(
        await Effect.runPromise(Stream.runCollect(artifact.body)),
      );
    };
    const json = await exportJson(sourceSlug);
    const archive = mediaArchive
      ? zipSync({ "export.json": json, "media.zip": mediaArchive })
      : json;
    const type = mediaArchive ? "application/zip" : "application/json";
    const run = async (
      mode: "preview" | "apply",
      preserveStates = false,
      bytes = archive,
      actor = principal,
    ) => {
      const files = await receiveImport(readable(bytes), type);
      try {
        return await Effect.runPromise(
          importer.run(files, actor, mode, preserveStates),
        );
      } finally {
        await files.dispose();
      }
    };
    return {
      sourceId,
      targetId,
      foreignId,
      targetSlug,
      keyId,
      principal,
      run,
      exportJson,
      json,
      archive,
      importer,
      mediaId,
    };
  }

  it("previews without writes, imports drafts by default, and preserves dates, relationships and existing history", async () => {
    const test = await fixture();
    expect(await test.run("preview")).toMatchObject({
      mode: "preview",
      alreadyImported: false,
      counts: { posts: 4, authors: 1, categories: 1 },
    });
    expect(
      await database.client.query.post.findMany({
        where: eq(schema.post.blogId, test.targetId),
      }),
    ).toEqual([]);
    await test.run("apply");
    const posts = await database.client.query.post.findMany({
      where: eq(schema.post.blogId, test.targetId),
      with: { author: true, categories: true, revisions: true },
    });
    expect(posts.map((post) => post.status)).toEqual([
      "draft",
      "draft",
      "draft",
      "draft",
    ]);
    expect(
      posts
        .find((post) => post.slug === "published")
        ?.publishedAt?.toISOString(),
    ).toBe("2024-02-03T00:00:00.000Z");
    expect(
      posts.every(
        (post) =>
          post.author.blogId === test.targetId &&
          post.author.userId === null &&
          post.createdById === null &&
          post.categories.length === 1,
      ),
    ).toBe(true);
    expect(posts.flatMap((post) => post.revisions)).toHaveLength(1);
    expect(
      posts.find((post) => post.slug === "published")?.revisions[0]?.version,
    ).toBe(3);
    expect(await test.run("apply")).toMatchObject({ alreadyImported: true });
    await database.client
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.blogId, test.targetId));
    expect(await test.run("apply")).toMatchObject({ alreadyImported: true });
  });

  it("roundtrips normalized domain content and managed original media with explicit state restoration", async () => {
    const test = await fixture(true);
    const source = JSON.parse(test.json.toString());
    await test.run("apply", true);
    const target = JSON.parse(
      (await test.exportJson(test.targetSlug)).toString(),
    );
    const normalize = (document: typeof source) => ({
      posts: document.posts
        .map((post: Record<string, unknown>) => {
          const author = post["author"] as { slug: string };
          const categories = post["categories"] as {
            category: { slug: string };
          }[];
          const revisions = post["revisions"] as {
            version: number;
            snapshot: Record<string, unknown>;
          }[];
          return {
            slug: post["slug"],
            title: post["title"],
            status: post["status"],
            locale: post["locale"],
            markdown: post["contentMarkdown"],
            excerpt: post["excerpt"],
            publishedAt: post["publishedAt"],
            scheduledAt: post["scheduledAt"],
            archivedAt: post["archivedAt"],
            author: author.slug,
            categories: categories.map((link) => link.category.slug),
            revisions: revisions.map((revision) => ({
              version: revision.version,
              title: revision.snapshot["title"],
              markdown: revision.snapshot["contentMarkdown"],
              publishedAt: revision.snapshot["publishedAt"],
            })),
          };
        })
        .sort((left: { slug: string }, right: { slug: string }) =>
          left.slug.localeCompare(right.slug),
        ),
      authors: document.authors.map(
        ({ slug, name, bio, credentials }: Record<string, unknown>) => ({
          slug,
          name,
          bio,
          credentials,
        }),
      ),
      categories: document.categories.map(
        ({ slug, name, description }: Record<string, unknown>) => ({
          slug,
          name,
          description,
        }),
      ),
      snippets: document.snippets.map(
        ({ name, key, contentMarkdown }: Record<string, unknown>) => ({
          name,
          key,
          contentMarkdown,
        }),
      ),
      redirects: document.redirects.map(
        ({ fromPath, toPath, statusCode }: Record<string, unknown>) => ({
          fromPath,
          toPath,
          statusCode,
        }),
      ),
      media: document.mediaAssets.map(
        (asset: {
          filename: string;
          variants: { kind: string; checksumSha256: string }[];
        }) => ({
          filename: asset.filename,
          checksum: asset.variants.find(
            (variant) => variant.kind === "original",
          )?.checksumSha256,
        }),
      ),
    });
    expect(normalize(target)).toEqual(normalize(source));
    expect(target.mediaAssets[0].id).not.toBe(source.mediaAssets[0].id);
    expect(
      target.posts.every(
        (post: { coverImageAssetId: string; coverImageUrl: string }) =>
          post.coverImageAssetId === target.mediaAssets[0].id &&
          post.coverImageUrl.startsWith(
            `https://media.test/publications/${test.targetId}/`,
          ),
      ),
    ).toBe(true);
    const queries = await Effect.runPromise(
      ContentQueries.Service.pipe(
        Effect.provide(
          ContentQueries.layer.pipe(
            Layer.provide(databaseLayer(database.client)),
          ),
        ),
      ),
    );
    const publicPosts = await Effect.runPromise(
      queries.getPublicPosts(test.targetId),
    );
    expect(publicPosts.map((post) => post.slug)).toEqual(["published"]);
    expect(await test.run("apply", true)).toMatchObject({
      alreadyImported: true,
    });
  });

  it("serializes concurrent retries, refuses overwrites and detects changed relationships", async () => {
    const test = await fixture();
    const result = await Promise.all([test.run("apply"), test.run("apply")]);
    expect(result.map((entry) => entry.alreadyImported).sort()).toEqual([
      false,
      true,
    ]);
    const [post] = await database.client.query.post.findMany({
      where: eq(schema.post.blogId, test.targetId),
    });
    if (!post) throw new Error("Missing imported post");
    await database.client
      .update(schema.post)
      .set({ title: "Edited locally" })
      .where(eq(schema.post.id, post.id));
    await expect(test.run("apply")).rejects.toBeInstanceOf(ApiImportConflict);
    expect(
      (
        await database.client.query.post.findFirst({
          where: eq(schema.post.id, post.id),
        })
      )?.title,
    ).toBe("Edited locally");
  });

  it("rejects cross-publication records, missing relationships, unsupported media states and revoked/expired keys", async () => {
    const test = await fixture();
    const document = JSON.parse(test.json.toString());
    document.authors[0].blogId = test.foreignId;
    await expect(
      test.run("apply", false, strToU8(JSON.stringify(document))),
    ).rejects.toBeInstanceOf(ApiImportRejected);
    document.authors[0].blogId = test.sourceId;
    document.categories = [];
    await expect(
      test.run("apply", false, strToU8(JSON.stringify(document))),
    ).rejects.toBeInstanceOf(ApiImportRejected);
    await expect(
      test.run(
        "apply",
        false,
        test.archive,
        new ApiAccess.Principal({ ...test.principal, blogId: test.foreignId }),
      ),
    ).rejects.toBeInstanceOf(ApiAccess.AuthenticationFailed);
    await database.client
      .update(schema.apiKey)
      .set({ expiresAt: new Date("2020-01-01") })
      .where(eq(schema.apiKey.id, test.keyId));
    await expect(test.run("apply")).rejects.toBeInstanceOf(
      ApiAccess.AuthenticationFailed,
    );
    expect(
      await database.client.query.post.findMany({
        where: eq(schema.post.blogId, test.targetId),
      }),
    ).toEqual([]);
  });

  it("rejects cumulative rewritten revision expansion before buffering unbounded history", async () => {
    const test = await fixture(true);
    const document = JSON.parse(test.json.toString());
    const published = document.posts.find(
      (post: { status: string }) => post.status === "published",
    );
    const revision = published.revisions[0];
    const sourceUrl = "http://a";
    document.mediaAssets[0].variants[0].publicUrl = sourceUrl;
    published.revisions = Array.from({ length: 50 }, (_, index) => ({
      ...revision,
      id: randomUUID(),
      version: index + 1,
      snapshot: {
        ...revision.snapshot,
        contentMarkdown: `${sourceUrl} `.repeat(800),
        contentHtml: "",
      },
    }));
    const input = strToU8(JSON.stringify(document));
    expect(input.byteLength).toBeLessThan(8 * 1024 * 1024);
    const media = unzipSync(test.archive)["media.zip"];
    if (!media) throw new Error("Missing media fixture");
    await expect(
      test.run(
        "apply",
        false,
        zipSync({ "export.json": input, "media.zip": media }),
      ),
    ).rejects.toMatchObject({
      _tag: "ApiImportRejected",
      item: expect.stringMatching(/^posts/),
      message: "Rewritten content exceeds 8 MB",
    });
    expect(
      await database.client.query.post.findMany({
        where: eq(schema.post.blogId, test.targetId),
      }),
    ).toEqual([]);
  });

  it.each([
    ["slug", "../bad"],
    ["title", ""],
    ["publishedAt", null],
  ])(
    "rejects an un-restorable revision %s before writing",
    async (field, value) => {
      const test = await fixture();
      const document = JSON.parse(test.json.toString());
      document.posts.find(
        (post: { status: string }) => post.status === "published",
      ).revisions[0].snapshot[field] = value;
      await expect(
        test.run("apply", false, strToU8(JSON.stringify(document))),
      ).rejects.toBeInstanceOf(ApiImportRejected);
      expect(
        await database.client.query.post.findMany({
          where: eq(schema.post.blogId, test.targetId),
        }),
      ).toEqual([]);
    },
  );

  it.each(["callback", "commit"])(
    "rolls back metadata and removes objects on %s failure",
    async (phase) => {
      const test = await fixture(true);
      const before = new Set(objects.keys());
      await database.client.execute(
        sql`create function fail_import_audit() returns trigger language plpgsql as $$begin if new.action = 'publication.imported' then raise exception 'test failure'; end if; return new; end$$`,
      );
      await database.client.execute(
        phase === "callback"
          ? sql`create trigger fail_import_audit before insert on audit_log for each row execute function fail_import_audit()`
          : sql`create constraint trigger fail_import_audit after insert on audit_log deferrable initially deferred for each row execute function fail_import_audit()`,
      );
      try {
        await expect(test.run("apply", true)).rejects.toMatchObject({
          _tag: "ImportPersistenceError",
        });
        expect(new Set(objects.keys())).toEqual(before);
        expect(
          await database.client.query.post.findMany({
            where: eq(schema.post.blogId, test.targetId),
          }),
        ).toEqual([]);
        expect(
          await database.client.query.mediaAsset.findMany({
            where: eq(schema.mediaAsset.blogId, test.targetId),
          }),
        ).toEqual([]);
      } finally {
        await database.client.execute(
          sql`drop trigger fail_import_audit on audit_log`,
        );
        await database.client.execute(sql`drop function fail_import_audit()`);
      }
      await test.run("apply", true);
    },
  );

  it("finishes the atomic apply before scoped file cleanup when a request is interrupted", async () => {
    const test = await fixture(true);
    const files = await receiveImport(
      readable(test.archive),
      "application/zip",
    );
    let started!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    beforePut = () => {
      started();
      return gate;
    };
    const controller = new AbortController();
    const running = Effect.runPromiseExit(
      test.importer.run(files, test.principal, "apply", false),
      { signal: controller.signal },
    );
    try {
      await ready;
      controller.abort();
      release();
      await running;
      expect(
        await database.client.query.post.findMany({
          where: eq(schema.post.blogId, test.targetId),
        }),
      ).toHaveLength(4);
      expect(
        await database.client.query.mediaAsset.findMany({
          where: eq(schema.mediaAsset.blogId, test.targetId),
        }),
      ).toHaveLength(1);
    } finally {
      release();
      beforePut = undefined;
      await files.dispose();
    }
    expect(await test.run("apply")).toMatchObject({ alreadyImported: true });
  });

  it("checks destination quota before storage writes", async () => {
    const test = await fixture(true);
    const before = new Set(objects.keys());
    await database.client
      .update(schema.blog)
      .set({ mediaStorageQuotaBytes: 1 })
      .where(eq(schema.blog.id, test.targetId));
    await expect(test.run("apply", true)).rejects.toMatchObject({
      _tag: "ApiImportRejected",
      item: "mediaAssets",
    });
    expect(new Set(objects.keys())).toEqual(before);
    expect(
      await database.client.query.author.findMany({
        where: and(eq(schema.author.blogId, test.targetId)),
      }),
    ).toEqual([]);
  });
});
