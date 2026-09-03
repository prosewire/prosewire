import { ApiUnavailable } from "@prosewire/contract";
import { Context, Deferred, Effect, Fiber, Option, Stream } from "effect";
import { Tool } from "effect/unstable/ai";
import { describe, expect, it, vi } from "vitest";
import {
  createProsewireMcpHandlers,
  createProsewireMcpLayer,
  createProsewireMcpServer,
  type ProsewireMcpClient,
  ProsewireToolkit,
} from "./server.ts";

const id = "11111111-1111-4111-8111-111111111111";
const now = "2026-08-20T00:00:00.000Z";
const post = {
  id,
  blogId: id,
  title: "Draft",
  slug: "draft",
  excerpt: "",
  contentMarkdown: "",
  contentHtml: "",
  coverImageAssetId: null,
  coverImageUrl: null,
  coverImageAlt: null,
  status: "draft" as const,
  locale: "en",
  featured: false,
  seoTitle: null,
  seoDescription: null,
  focusKeyword: null,
  canonicalUrl: null,
  publishedAt: null,
  scheduledAt: null,
  createdAt: now,
  updatedAt: now,
  author: {
    id,
    name: "Writer",
    slug: "writer",
    bio: null,
    avatarUrl: null,
    jobTitle: null,
    credentials: null,
  },
  categories: [],
};

const mediaAsset = {
  id,
  blogId: id,
  filename: "cover.png",
  mimeType: "image/png",
  byteSize: 100,
  storageBytes: 200,
  width: 10,
  height: 10,
  checksumSha256: "abc",
  status: "ready" as const,
  url: "https://media.example/cover.webp",
  variants: [],
  references: [],
  uploadedAt: now,
  createdAt: now,
  updatedAt: now,
};

function mockClient(): ProsewireMcpClient {
  return {
    blogs: { list: vi.fn(() => Effect.succeed([])) },
    posts: {
      list: vi.fn(() =>
        Effect.succeed({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
      ),
      get: vi.fn(() => Effect.succeed(post)),
      create: vi.fn(() => Effect.succeed(post)),
      update: vi.fn(() => Effect.succeed({ ...post, title: "Updated" })),
      revisions: vi.fn(() => Effect.succeed([])),
      restore: vi.fn(() => Effect.succeed({ ...post, title: "Restored" })),
      archive: vi.fn(() => Effect.succeed({ ok: true as const })),
    },
    media: {
      list: vi.fn(() =>
        Effect.succeed({
          items: [mediaAsset],
          usage: {
            usedBytes: 200,
            quotaBytes: 1_000,
            remainingBytes: 800,
          },
          configured: true,
          maxUploadBytes: 500,
        }),
      ),
      startUpload: vi.fn(() =>
        Effect.succeed({
          asset: { ...mediaAsset, status: "pending" as const, url: null },
          upload: {
            url: "https://storage.example/upload",
            method: "PUT" as const,
            headers: { "content-type": "image/png" },
            expiresAt: now,
          },
          usage: {
            usedBytes: 200,
            quotaBytes: 1_000,
            remainingBytes: 800,
          },
        }),
      ),
      completeUpload: vi.fn(() => Effect.succeed(mediaAsset)),
      delete: vi.fn(() => Effect.succeed({ ok: true as const })),
    },
  };
}

async function buildToolkit(client: ProsewireMcpClient) {
  return Effect.runPromise(
    ProsewireToolkit.pipe(Effect.provide(createProsewireMcpHandlers(client))),
  );
}

type BuiltToolkit = Awaited<ReturnType<typeof buildToolkit>>;

async function runTool<A, E, E2>(
  client: ProsewireMcpClient,
  execute: (
    toolkit: BuiltToolkit,
  ) => Effect.Effect<
    Stream.Stream<{ readonly encodedResult: A }, E, never>,
    E2,
    never
  >,
) {
  const built = await buildToolkit(client);
  return Effect.runPromise(
    execute(built).pipe(
      Effect.flatMap(Stream.runLast),
      Effect.map(Option.getOrThrow),
      Effect.map((result) => result.encodedResult),
    ),
  );
}

describe("Prosewire Effect MCP server", () => {
  it("advertises risk annotations for every public tool", () => {
    expect(Object.keys(ProsewireToolkit.tools)).toEqual([
      "publication_get",
      "posts_list",
      "posts_get",
      "posts_create",
      "posts_update",
      "posts_revisions_list",
      "posts_revision_restore",
      "posts_archive",
      "media_list",
      "media_upload_start",
      "media_upload_complete",
      "media_delete",
    ]);
    expect(
      Context.get(ProsewireToolkit.tools.posts_list.annotations, Tool.Readonly),
    ).toBe(true);
    expect(
      Context.get(
        ProsewireToolkit.tools.posts_list.annotations,
        Tool.Destructive,
      ),
    ).toBe(false);
    expect(
      Context.get(
        ProsewireToolkit.tools.posts_archive.annotations,
        Tool.Readonly,
      ),
    ).toBe(false);
    expect(
      Context.get(
        ProsewireToolkit.tools.posts_archive.annotations,
        Tool.Destructive,
      ),
    ).toBe(true);
    expect(ProsewireToolkit.tools.posts_archive.needsApproval).toBe(true);
    expect(
      Context.get(
        ProsewireToolkit.tools.posts_revision_restore.annotations,
        Tool.Destructive,
      ),
    ).toBe(true);
    expect(ProsewireToolkit.tools.posts_revision_restore.needsApproval).toBe(
      true,
    );
    expect(
      Context.get(ProsewireToolkit.tools.media_list.annotations, Tool.Readonly),
    ).toBe(true);
    expect(
      Context.get(
        ProsewireToolkit.tools.media_delete.annotations,
        Tool.Destructive,
      ),
    ).toBe(true);
    expect(ProsewireToolkit.tools.media_delete.needsApproval).toBe(true);
  });

  it("validates inputs and delegates all tools to the Effect SDK", async () => {
    const client = mockClient();
    await expect(
      runTool(client, (toolkit) => toolkit.handle("publication_get", {})),
    ).resolves.toEqual({
      publications: [],
    });
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_list", { status: "draft" }),
      ),
    ).resolves.toMatchObject({ total: 0 });
    await expect(
      runTool(client, (toolkit) => toolkit.handle("posts_get", { id })),
    ).resolves.toMatchObject({ id });
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_revisions_list", { id }),
      ),
    ).resolves.toEqual([]);
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_create", {
          blogId: id,
          authorId: id,
          title: "Draft",
          slug: "draft",
          contentMarkdown: "",
          status: "draft",
          locale: "en",
          featured: false,
          categoryIds: [],
        }),
      ),
    ).resolves.toMatchObject({ id });
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_update", {
          id,
          body: { title: "Updated" },
        }),
      ),
    ).resolves.toMatchObject({ title: "Updated" });
    await expect(
      runTool(client, (toolkit) => toolkit.handle("posts_archive", { id })),
    ).resolves.toEqual({ ok: true });
    await expect(
      runTool(client, (toolkit) => toolkit.handle("media_list", {})),
    ).resolves.toMatchObject({ configured: true });
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("media_upload_start", {
          blogId: id,
          filename: "cover.png",
          mimeType: "image/png",
          byteSize: 100,
        }),
      ),
    ).resolves.toMatchObject({ upload: { method: "PUT" } });
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("media_upload_complete", { id }),
      ),
    ).resolves.toMatchObject({ id });
    await expect(
      runTool(client, (toolkit) => toolkit.handle("media_delete", { id })),
    ).resolves.toEqual({ ok: true });
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_revision_restore", {
          id,
          revisionId: id,
        }),
      ),
    ).resolves.toMatchObject({ title: "Restored" });

    expect(client.posts.list).toHaveBeenCalledWith({
      status: "draft",
      page: 1,
      pageSize: 20,
    });
    expect(client.posts.get).toHaveBeenCalledWith({ params: { id } });
    expect(client.posts.create).toHaveBeenCalledWith({
      blogId: id,
      authorId: id,
      title: "Draft",
      slug: "draft",
      contentMarkdown: "",
      status: "draft",
      locale: "en",
      featured: false,
      categoryIds: [],
    });
    expect(client.posts.update).toHaveBeenCalledWith({
      params: { id },
      body: { title: "Updated" },
    });
    expect(client.posts.revisions).toHaveBeenCalledWith({ params: { id } });
    expect(client.posts.restore).toHaveBeenCalledWith({
      params: { id, revisionId: id },
    });
    expect(client.posts.archive).toHaveBeenCalledWith({ params: { id } });
    expect(client.media.list).toHaveBeenCalledWith();
    expect(client.media.startUpload).toHaveBeenCalledWith({
      blogId: id,
      filename: "cover.png",
      mimeType: "image/png",
      byteSize: 100,
    });
    expect(client.media.completeUpload).toHaveBeenCalledWith({
      params: { id },
    });
    expect(client.media.delete).toHaveBeenCalledWith({ params: { id } });
  });

  it("rejects invalid UUIDs before calling the SDK", async () => {
    const client = mockClient();
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_archive", { id: "not-a-uuid" }),
      ),
    ).rejects.toThrow();
    expect(client.posts.archive).not.toHaveBeenCalled();
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_revision_restore", {
          id,
          revisionId: "not-a-uuid",
        }),
      ),
    ).rejects.toThrow();
    expect(client.posts.restore).not.toHaveBeenCalled();
  });

  it("preserves SDK error messages and falls back for unknown failures", async () => {
    const client = mockClient();
    vi.mocked(client.posts.list)
      .mockReturnValueOnce(
        Effect.fail(new ApiUnavailable({ message: "SDK unavailable" })),
      )
      .mockReturnValueOnce(Effect.fail("offline"));

    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_list", { page: 2, pageSize: 10 }),
      ),
    ).rejects.toThrow("SDK unavailable");
    await expect(
      runTool(client, (toolkit) =>
        toolkit.handle("posts_list", { page: 2, pageSize: 10 }),
      ),
    ).rejects.toThrow("Prosewire request failed");

    expect(client.posts.list).toHaveBeenNthCalledWith(1, {
      page: 2,
      pageSize: 10,
    });
  });

  it("interrupts an in-flight SDK effect when a tool is cancelled", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const interrupted = yield* Deferred.make<void>();
        const client = mockClient();
        vi.mocked(client.posts.archive).mockReturnValue(
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
            Effect.as({ ok: true as const }),
          ),
        );
        const toolkit = yield* ProsewireToolkit.pipe(
          Effect.provide(createProsewireMcpHandlers(client)),
        );
        const fiber = yield* toolkit
          .handle("posts_archive", { id })
          .pipe(Effect.flatMap(Stream.runDrain), Effect.forkChild);

        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);

        expect(yield* Deferred.isDone(interrupted)).toBe(true);
      }),
    );
  });

  it("builds both MCP server entrypoint aliases", () => {
    const client = mockClient();

    expect(createProsewireMcpServer(client)).toBeDefined();
    expect(createProsewireMcpLayer(client, "test-version")).toBeDefined();
  });
});
