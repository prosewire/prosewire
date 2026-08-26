import type { PublicContentClient } from "@prosewire/sdk";
import { describe, expect, it, vi } from "vitest";
import { type CliPrivateClient, runProgram } from "./program.ts";

function privateClient(
  overrides: Partial<CliPrivateClient["posts"]> = {},
): CliPrivateClient {
  return {
    posts: {
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      revisions: vi.fn(),
      restore: vi.fn(),
      ...overrides,
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
    });
    expect(listPosts).toHaveBeenCalledWith({ search: "portable" });

    await runProgram(["node", "prosewire", "get", "published"], dependencies);
    expect(getPost).toHaveBeenCalledWith("published");
    expect(output).toHaveBeenCalledTimes(2);
  });

  it("creates a post from JSON with a private API key", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: "post-id", status: "draft" });
    const createClient = vi.fn(() => privateClient({ create }));
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
      createClient,
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

    expect(readFile).toHaveBeenCalledWith("post.json", "utf8");
    expect(createClient).toHaveBeenCalledWith({
      baseUrl: "https://content.example",
      apiKey: "pw_test",
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
          createClient: vi.fn(() => privateClient({ create })),
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
      .mockResolvedValue({ id: "post-id", title: "Updated" });
    const archive = vi.fn().mockResolvedValue({ ok: true });
    const createClient = vi.fn(() => privateClient({ update, archive }));
    const output = vi.fn();
    const readFile = vi.fn().mockResolvedValue('{"title":"Updated"}');
    const dependencies = { createClient, readFile, output, env: {} };

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
    const revisions = vi.fn().mockResolvedValue([{ id: revisionId }]);
    const restore = vi.fn().mockResolvedValue({ id: postId, title: "Earlier" });
    const output = vi.fn();
    const createClient = vi.fn(() => privateClient({ revisions, restore }));
    const dependencies = { createClient, output, env: {} };

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
