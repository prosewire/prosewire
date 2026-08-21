import { Context, Effect, Option, Stream } from "effect";
import { Tool } from "effect/unstable/ai";
import { describe, expect, it, vi } from "vitest";
import {
  createProsewireMcpHandlers,
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

function mockClient(): ProsewireMcpClient {
  return {
    blogs: { list: vi.fn().mockResolvedValue([]) },
    posts: {
      list: vi.fn().mockResolvedValue({
        items: [], total: 0, page: 1, pageSize: 20,
      }),
      get: vi.fn().mockResolvedValue(post),
      create: vi.fn().mockResolvedValue(post),
      update: vi.fn().mockResolvedValue({ ...post, title: "Updated" }),
      archive: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

async function buildToolkit(client: ProsewireMcpClient) {
  return Effect.runPromise(
    ProsewireToolkit.pipe(
      Effect.provide(createProsewireMcpHandlers(client)),
    ),
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
      "posts_archive",
    ]);
    expect(Context.get(ProsewireToolkit.tools.posts_list.annotations, Tool.Readonly))
      .toBe(true);
    expect(Context.get(ProsewireToolkit.tools.posts_list.annotations, Tool.Destructive))
      .toBe(false);
    expect(Context.get(ProsewireToolkit.tools.posts_archive.annotations, Tool.Readonly))
      .toBe(false);
    expect(Context.get(ProsewireToolkit.tools.posts_archive.annotations, Tool.Destructive))
      .toBe(true);
    expect(ProsewireToolkit.tools.posts_archive.needsApproval).toBe(true);
  });

  it("validates inputs and delegates all tools to the Promise SDK facade", async () => {
    const client = mockClient();
    await expect(runTool(client, (toolkit) =>
      toolkit.handle("publication_get", {}))).resolves.toEqual({
      publications: [],
    });
    await expect(runTool(client, (toolkit) =>
      toolkit.handle("posts_list", { status: "draft" }))).resolves
      .toMatchObject({ total: 0 });
    await expect(runTool(client, (toolkit) =>
      toolkit.handle("posts_get", { id }))).resolves
      .toMatchObject({ id });
    await expect(runTool(client, (toolkit) => toolkit.handle("posts_create", {
      blogId: id,
      authorId: id,
      title: "Draft",
      slug: "draft",
      contentMarkdown: "",
      status: "draft",
      locale: "en",
      featured: false,
      categoryIds: [],
    }))).resolves.toMatchObject({ id });
    await expect(runTool(client, (toolkit) => toolkit.handle("posts_update", {
      id,
      body: { title: "Updated" },
    }))).resolves.toMatchObject({ title: "Updated" });
    await expect(runTool(client, (toolkit) =>
      toolkit.handle("posts_archive", { id }))).resolves
      .toEqual({ ok: true });

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
    expect(client.posts.archive).toHaveBeenCalledWith({ params: { id } });
  });

  it("rejects invalid UUIDs before calling the SDK", async () => {
    const client = mockClient();
    await expect(runTool(client, (toolkit) =>
      toolkit.handle("posts_archive", { id: "not-a-uuid" })))
      .rejects.toThrow();
    expect(client.posts.archive).not.toHaveBeenCalled();
  });
});
