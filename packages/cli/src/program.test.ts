import { describe, expect, it, vi } from "vitest";
import type { Client, PublicContentClient } from "@prosewire/sdk";
import { createProgram } from "./program.ts";

function publicClient(overrides: Partial<PublicContentClient> = {}): PublicContentClient {
  return {
    listPosts: vi.fn().mockResolvedValue({ posts: [{ title: "Published" }] }),
    getPost: vi.fn().mockResolvedValue({ post: { slug: "published" } }),
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
    const program = createProgram({
      createPublicClient,
      output,
      env: {
        PROSEWIRE_API_URL: "https://content.example",
        PROSEWIRE_BLOG: "fieldnotes",
      },
    });

    await program.parseAsync(["node", "prosewire", "posts", "--search", "portable"]);
    expect(createPublicClient).toHaveBeenCalledWith({
      baseUrl: "https://content.example",
      blog: "fieldnotes",
    });
    expect(listPosts).toHaveBeenCalledWith({ search: "portable" });

    await program.parseAsync(["node", "prosewire", "get", "published"]);
    expect(getPost).toHaveBeenCalledWith("published");
    expect(output).toHaveBeenCalledTimes(2);
  });

  it("creates a post from JSON with a private API key", async () => {
    const create = vi.fn().mockResolvedValue({ id: "post-id", status: "draft" });
    const createClient = vi.fn(() => ({ posts: { create } }) as unknown as Client);
    const output = vi.fn();
    const readFile = vi.fn().mockResolvedValue('{"title":"CLI draft"}');
    const program = createProgram({
      createClient,
      readFile,
      output,
      env: {},
    });

    await program.parseAsync([
      "node",
      "prosewire",
      "--url",
      "https://content.example",
      "--key",
      "pw_test",
      "create",
      "--data",
      "post.json",
    ]);

    expect(readFile).toHaveBeenCalledWith("post.json", "utf8");
    expect(createClient).toHaveBeenCalledWith({
      baseUrl: "https://content.example",
      apiKey: "pw_test",
    });
    expect(create).toHaveBeenCalledWith({ title: "CLI draft" });
    expect(output).toHaveBeenCalledWith({ id: "post-id", status: "draft" });
  });

  it("refuses private mutations without a key", async () => {
    const program = createProgram({ env: {}, readFile: vi.fn() });
    await expect(
      program.parseAsync([
        "node",
        "prosewire",
        "create",
        "--data",
        "post.json",
      ]),
    ).rejects.toThrow("--key or PROSEWIRE_API_KEY is required");

    await expect(
      createProgram({ env: {}, readFile: vi.fn() }).parseAsync([
        "node",
        "prosewire",
        "update",
        "11111111-1111-4111-8111-111111111111",
        "--data",
        "post.json",
      ]),
    ).rejects.toThrow("--key or PROSEWIRE_API_KEY is required");

    await expect(
      createProgram({ env: {}, readFile: vi.fn() }).parseAsync([
        "node",
        "prosewire",
        "archive",
        "11111111-1111-4111-8111-111111111111",
        "--yes",
      ]),
    ).rejects.toThrow("--key or PROSEWIRE_API_KEY is required");
  });

  it("requires a publication for public reads", async () => {
    await expect(
      createProgram({ env: {} }).parseAsync(["node", "prosewire", "posts"]),
    ).rejects.toThrow("--blog or PROSEWIRE_BLOG is required");
    await expect(
      createProgram({ env: {} }).parseAsync([
        "node",
        "prosewire",
        "get",
        "post",
      ]),
    ).rejects.toThrow("--blog or PROSEWIRE_BLOG is required");
  });

  it("updates and explicitly archives posts through the private API", async () => {
    const update = vi.fn().mockResolvedValue({ id: "post-id", title: "Updated" });
    const archive = vi.fn().mockResolvedValue({ ok: true });
    const createClient = vi.fn(
      () => ({ posts: { update, archive } }) as unknown as Client,
    );
    const output = vi.fn();
    const readFile = vi.fn().mockResolvedValue('{"title":"Updated"}');
    const program = createProgram({ createClient, readFile, output, env: {} });

    await program.parseAsync([
      "node",
      "prosewire",
      "--key",
      "pw_test",
      "update",
      "11111111-1111-4111-8111-111111111111",
      "--data",
      "changes.json",
    ]);
    await program.parseAsync([
      "node",
      "prosewire",
      "--key",
      "pw_test",
      "archive",
      "11111111-1111-4111-8111-111111111111",
      "--yes",
    ]);

    expect(update).toHaveBeenCalledWith({
      params: { id: "11111111-1111-4111-8111-111111111111" },
      body: { title: "Updated" },
    });
    expect(archive).toHaveBeenCalledWith({
      params: { id: "11111111-1111-4111-8111-111111111111" },
    });
  });

  it("writes JSON to stdout by default", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const listPosts = vi
      .fn()
      .mockResolvedValue({ posts: [{ title: "Published" }] });
    const client = publicClient({ listPosts });
    const program = createProgram({
      createPublicClient: vi.fn(() => client),
      env: {},
    });
    try {
      await program.parseAsync([
        "node",
        "prosewire",
        "posts",
        "--blog",
        "fieldnotes",
      ]);
      expect(listPosts).toHaveBeenCalledWith({});
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining('"Published"'),
      );
    } finally {
      write.mockRestore();
    }
  });
});
