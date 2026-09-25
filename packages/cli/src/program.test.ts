import type { PublicContentClient } from "@prosewire/sdk";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { type CliPrivateClient, programEffect, runProgram } from "./program.ts";

function privateClient(
  overrides: Partial<CliPrivateClient["posts"]> = {},
  mediaOverrides: Partial<CliPrivateClient["media"]> = {},
): CliPrivateClient {
  return {
    blogs: { list: vi.fn() },
    posts: {
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      revisions: vi.fn(),
      restore: vi.fn(),
      ...overrides,
    },
    media: {
      list: vi.fn(),
      get: vi.fn(),
      startUpload: vi.fn(),
      completeUpload: vi.fn(),
      delete: vi.fn(),
      ...mediaOverrides,
    },
  };
}

function publicClient(
  overrides: Partial<PublicContentClient> = {},
): PublicContentClient {
  return {
    listPosts: vi.fn().mockResolvedValue({ posts: [{ title: "Published" }] }),
    listAllPosts: vi.fn().mockResolvedValue([]),
    getPost: vi.fn().mockResolvedValue({ post: { slug: "published" } }),
    resolvePost: vi.fn().mockResolvedValue({ status: "not-found" }),
    listRedirects: vi.fn().mockResolvedValue([]),
    getRendered: vi.fn().mockResolvedValue("<article />"),
    ...overrides,
  };
}

describe("Prosewire CLI", () => {
  it.each([
    ["media-list"],
    ["media-upload", "cover.webp", "--blog-id", "publication-id"],
    ["media-delete", "asset-id", "--yes"],
  ])("rejects media command %s without a key", async (...args) => {
    const createEffectClient = vi.fn();
    const readFile = vi.fn();
    const output = vi.fn();

    await expect(
      runProgram(["node", "prosewire", ...args], {
        createEffectClient,
        readFile,
        output,
        env: {},
      }),
    ).rejects.toThrow("--key or PROSEWIRE_API_KEY is required");
    expect(createEffectClient).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
  });


  it.each([
    ["private", ["--key", "pw_test", "media-list"]],
    ["public", ["posts", "--blog", "fieldnotes"]],
  ] as const)(
    "aborts active %s HTTP requests when the command is interrupted",
    async (_kind, args) => {
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      let requestSignal: AbortSignal | undefined;
      const request: typeof fetch = (input, init) => {
        requestSignal = new Request(input, init).signal;
        started();
        return new Promise((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Canceled", "AbortError")),
            { once: true },
          );
        });
      };
      const controller = new AbortController();
      const output = vi.fn();
      const running = Effect.runPromiseExit(
        programEffect(args, { fetch: request, output, env: {} }),
        { signal: controller.signal },
      );
      await ready;
      controller.abort();
      const exit = await running;
      expect(exit._tag).toBe("Failure");
      expect(requestSignal?.aborted).toBe(true);
      expect(output).not.toHaveBeenCalled();
    },
  );

  it("aborts an upload and does not issue its completion mutation", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let uploadSignal: AbortSignal | null | undefined;
    const completeUpload = vi.fn();
    const request: typeof fetch = (_input, init) => {
      uploadSignal = init?.signal;
      started();
      return new Promise((_resolve, reject) => {
        uploadSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("Canceled", "AbortError")),
          { once: true },
        );
      });
    };
    const startUpload = vi.fn().mockReturnValue(
      Effect.succeed({
        asset: { id: "22222222-2222-4222-8222-222222222222" },
        upload: {
          url: "https://storage.example/signed",
          method: "PUT",
          headers: {},
        },
      }),
    );
    const controller = new AbortController();
    const running = Effect.runPromiseExit(
      programEffect(
        [
          "--key",
          "pw_test",
          "media-upload",
          "cover.webp",
          "--blog-id",
          "11111111-1111-4111-8111-111111111111",
        ],
        {
          env: {},
          fetch: request,
          readFile: vi.fn().mockResolvedValue(new Uint8Array([1])),
          createEffectClient: () =>
            privateClient({}, { startUpload, completeUpload }),
          output: vi.fn(),
        },
      ),
      { signal: controller.signal },
    );
    await ready;
    controller.abort();
    await running;
    expect(uploadSignal?.aborted).toBe(true);
    expect(completeUpload).not.toHaveBeenCalled();
  });

  it("lists and retrieves public posts with environment defaults", async () => {
    const listPosts = vi.fn().mockResolvedValue({ posts: [] });
    const getPost = vi.fn().mockResolvedValue({ post: { slug: "published" } });
    const client = publicClient({ listPosts, getPost });
    const output = vi.fn();
    const createPublicClient = vi.fn(() => client);
    const dependencies = {
      createPublicClient,
      output,
      env: {
        PROSEWIRE_API_URL: "https://content.example",
        PROSEWIRE_BLOG: "fieldnotes",
      },
    };

    await runProgram(
      ["node", "prosewire", "posts", "--search", "portable"],
      dependencies,
    );
    expect(createPublicClient).toHaveBeenCalledWith({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
      fetch: expect.any(Function),
    });
    expect(listPosts).toHaveBeenCalledWith({ search: "portable" });

    await runProgram(["node", "prosewire", "get", "published"], dependencies);
    expect(getPost).toHaveBeenCalledWith("published");
    expect(output).toHaveBeenCalledTimes(2);
  });

  it("creates a post from JSON with a private API key", async () => {
    const create = vi
      .fn()
      .mockReturnValue(Effect.succeed({ id: "post-id", status: "draft" }));
    const createEffectClient = vi.fn(() => privateClient({ create }));
    const output = vi.fn();
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        blogId: "11111111-1111-4111-8111-111111111111",
        authorId: "22222222-2222-4222-8222-222222222222",
        title: "CLI draft",
        slug: "cli-draft",
      }),
    );
    const dependencies = {
      createEffectClient,
      readFile,
      output,
      env: {},
    };

    await runProgram(
      [
        "node",
        "prosewire",
        "--url",
        "https://content.example",
        "--key",
        "pw_test",
        "create",
        "--data",
        "post.json",
      ],
      dependencies,
    );

    expect(readFile).toHaveBeenCalledWith("post.json", {
      encoding: "utf8",
      signal: expect.any(AbortSignal),
    });
    expect(createEffectClient).toHaveBeenCalledWith({
      baseUrl: "https://content.example",
      apiKey: "pw_test",
      fetch: expect.any(Function),
    });
    expect(create).toHaveBeenCalledWith({
      blogId: "11111111-1111-4111-8111-111111111111",
      authorId: "22222222-2222-4222-8222-222222222222",
      title: "CLI draft",
      slug: "cli-draft",
      contentMarkdown: "",
      status: "draft",
      featured: false,
      categoryIds: [],
    });
    expect(output).toHaveBeenCalledWith({ id: "post-id", status: "draft" });
  });

  it("rejects JSON that does not match the command schema", async () => {
    const create = vi.fn();

    await expect(
      runProgram(
        [
          "node",
          "prosewire",
          "--key",
          "pw_test",
          "create",
          "--data",
          "post.json",
        ],
        {
          createEffectClient: vi.fn(() => privateClient({ create })),
          readFile: vi.fn().mockResolvedValue('{"title":"Missing IDs"}'),
          env: {},
        },
      ),
    ).rejects.toThrow();

    expect(create).not.toHaveBeenCalled();
  });

  it("refuses private mutations without a key", async () => {
    await expect(
      runProgram(["node", "prosewire", "create", "--data", "post.json"], {
        env: {},
        readFile: vi.fn(),
      }),
    ).rejects.toThrow("--key or PROSEWIRE_API_KEY is required");

    await expect(
      runProgram(
        [
          "node",
          "prosewire",
          "update",
          "11111111-1111-4111-8111-111111111111",
          "--data",
          "post.json",
        ],
        { env: {}, readFile: vi.fn() },
      ),
    ).rejects.toThrow("--key or PROSEWIRE_API_KEY is required");

    await expect(
      runProgram(
        [
          "node",
          "prosewire",
          "archive",
          "11111111-1111-4111-8111-111111111111",
          "--yes",
        ],
        { env: {}, readFile: vi.fn() },
      ),
    ).rejects.toThrow("--key or PROSEWIRE_API_KEY is required");

    await expect(
      runProgram(
        [
          "node",
          "prosewire",
          "revisions",
          "11111111-1111-4111-8111-111111111111",
        ],
        { env: {} },
      ),
    ).rejects.toThrow("--key or PROSEWIRE_API_KEY is required");
  });

  it("requires a publication for public reads", async () => {
    await expect(
      runProgram(["node", "prosewire", "posts"], { env: {} }),
    ).rejects.toThrow("--blog or PROSEWIRE_BLOG is required");
    await expect(
      runProgram(["node", "prosewire", "get", "post"], { env: {} }),
    ).rejects.toThrow("--blog or PROSEWIRE_BLOG is required");
  });

  it("updates and explicitly archives posts through the private API", async () => {
    const update = vi
      .fn()
      .mockReturnValue(Effect.succeed({ id: "post-id", title: "Updated" }));
    const archive = vi.fn().mockReturnValue(Effect.succeed({ ok: true }));
    const createEffectClient = vi.fn(() => privateClient({ update, archive }));
    const output = vi.fn();
    const readFile = vi.fn().mockResolvedValue('{"title":"Updated"}');
    const dependencies = { createEffectClient, readFile, output, env: {} };

    await runProgram(
      [
        "node",
        "prosewire",
        "--key",
        "pw_test",
        "update",
        "11111111-1111-4111-8111-111111111111",
        "--data",
        "changes.json",
      ],
      dependencies,
    );
    await runProgram(
      [
        "node",
        "prosewire",
        "--key",
        "pw_test",
        "archive",
        "11111111-1111-4111-8111-111111111111",
        "--yes",
      ],
      dependencies,
    );

    expect(update).toHaveBeenCalledWith({
      params: { id: "11111111-1111-4111-8111-111111111111" },
      body: { title: "Updated" },
    });
    expect(archive).toHaveBeenCalledWith({
      params: { id: "11111111-1111-4111-8111-111111111111" },
    });
  });

  it("lists and explicitly restores post revisions", async () => {
    const postId = "11111111-1111-4111-8111-111111111111";
    const revisionId = "22222222-2222-4222-8222-222222222222";
    const revisions = vi
      .fn()
      .mockReturnValue(Effect.succeed([{ id: revisionId }]));
    const restore = vi
      .fn()
      .mockReturnValue(Effect.succeed({ id: postId, title: "Earlier" }));
    const output = vi.fn();
    const createEffectClient = vi.fn(() =>
      privateClient({ revisions, restore }),
    );
    const dependencies = { createEffectClient, output, env: {} };

    await runProgram(
      ["node", "prosewire", "--key", "pw_test", "revisions", postId],
      dependencies,
    );
    await runProgram(
      [
        "node",
        "prosewire",
        "--key",
        "pw_test",
        "restore",
        postId,
        revisionId,
        "--yes",
      ],
      dependencies,
    );

    expect(revisions).toHaveBeenCalledWith({ params: { id: postId } });
    expect(restore).toHaveBeenCalledWith({
      params: { id: postId, revisionId },
    });
    expect(output).toHaveBeenCalledTimes(2);

    await expect(
      runProgram(
        [
          "node",
          "prosewire",
          "--key",
          "pw_test",
          "restore",
          postId,
          revisionId,
        ],
        dependencies,
      ),
    ).rejects.toThrow();
    expect(restore).toHaveBeenCalledOnce();
  });

  it("uploads, lists, and explicitly deletes media", async () => {
    const blogId = "11111111-1111-4111-8111-111111111111";
    const assetId = "22222222-2222-4222-8222-222222222222";
    const list = vi
      .fn()
      .mockReturnValue(Effect.succeed({ items: [], configured: true }));
    const startUpload = vi.fn().mockReturnValue(
      Effect.succeed({
        asset: { id: assetId },
        upload: {
          url: "https://storage.example/signed",
          method: "PUT",
          headers: { "content-type": "image/webp" },
        },
      }),
    );
    const completeUpload = vi
      .fn()
      .mockReturnValue(Effect.succeed({ id: assetId, status: "ready" }));
    const remove = vi.fn().mockReturnValue(Effect.succeed({ ok: true }));
    const client = privateClient(
      {},
      {
        list,
        startUpload,
        completeUpload,
        delete: remove,
      },
    );
    const output = vi.fn();
    const body = new Uint8Array([1, 2, 3]);
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const dependencies = {
      createEffectClient: vi.fn(() => client),
      readFile: vi.fn().mockResolvedValue(body),
      fetch,
      output,
      env: {},
    };

    await runProgram(
      ["node", "prosewire", "--key", "pw_test", "media-list"],
      dependencies,
    );
    await runProgram(
      [
        "node",
        "prosewire",
        "--key",
        "pw_test",
        "media-upload",
        "cover.webp",
        "--blog-id",
        blogId,
      ],
      dependencies,
    );
    await runProgram(
      [
        "node",
        "prosewire",
        "--key",
        "pw_test",
        "media-delete",
        assetId,
        "--yes",
      ],
      dependencies,
    );

    expect(list).toHaveBeenCalledOnce();
    expect(startUpload).toHaveBeenCalledWith({
      blogId,
      filename: "cover.webp",
      mimeType: "image/webp",
      byteSize: body.byteLength,
    });
    expect(fetch).toHaveBeenCalledWith("https://storage.example/signed", {
      method: "PUT",
      headers: { "content-type": "image/webp" },
      body,
      signal: expect.any(AbortSignal),
    });
    expect(completeUpload).toHaveBeenCalledWith({ params: { id: assetId } });
    expect(remove).toHaveBeenCalledWith({ params: { id: assetId } });
    expect(output).toHaveBeenCalledTimes(3);

    await expect(
      runProgram(
        ["node", "prosewire", "--key", "pw_test", "media-delete", assetId],
        dependencies,
      ),
    ).rejects.toThrow();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("writes JSON to stdout by default", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const listPosts = vi
      .fn()
      .mockResolvedValue({ posts: [{ title: "Published" }] });
    const client = publicClient({ listPosts });
    const dependencies = {
      createPublicClient: vi.fn(() => client),
      env: {},
    };
    try {
      await runProgram(
        ["node", "prosewire", "posts", "--blog", "fieldnotes"],
        dependencies,
      );
      expect(listPosts).toHaveBeenCalledWith({});
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining('"Published"'),
      );
    } finally {
      write.mockRestore();
    }
  });
});
