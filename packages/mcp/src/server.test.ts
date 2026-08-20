import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@prosewire/sdk";
import { createProsewireMcpServer } from "./server.ts";

const connected: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(connected.splice(0).map((entry) => entry.close()));
});

async function connect(client: Client) {
  const server = createProsewireMcpServer(client, "test");
  const mcp = new McpClient({ name: "acceptance-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await mcp.connect(clientTransport);
  connected.push(server, mcp);
  return mcp;
}

function text(result: unknown): unknown {
  if (!result || typeof result !== "object" || !("content" in result)) {
    throw new Error("Expected an immediate MCP tool result");
  }
  const block = (result as { content: Array<{ type: string; text?: string }> })
    .content[0];
  expect(block?.type).toBe("text");
  return JSON.parse(block?.type === "text" ? (block.text ?? "null") : "null") as unknown;
}

describe("Prosewire MCP server", () => {
  it("advertises risk annotations for all public tools", async () => {
    const mcp = await connect({
      blogs: { list: vi.fn().mockResolvedValue([]) },
      posts: {
        list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        archive: vi.fn(),
      },
    } as unknown as Client);

    const tools = await mcp.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "publication_get",
      "posts_list",
      "posts_get",
      "posts_create",
      "posts_update",
      "posts_archive",
    ]);
    expect(tools.tools.find((tool) => tool.name === "posts_list")?.annotations)
      .toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.tools.find((tool) => tool.name === "posts_archive")?.annotations)
      .toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("delegates read and destructive tools to the typed SDK client", async () => {
    const list = vi.fn().mockResolvedValue({ items: [{ title: "Draft" }], total: 1 });
    const get = vi.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    const archive = vi.fn().mockResolvedValue({ ok: true });
    const create = vi.fn().mockResolvedValue({ id: "created" });
    const update = vi.fn().mockResolvedValue({ id: "updated" });
    const blogs = vi.fn().mockResolvedValue([{ slug: "fieldnotes" }]);
    const mcp = await connect({
      blogs: { list: blogs },
      posts: { list, get, create, update, archive },
    } as unknown as Client);

    expect(text(await mcp.callTool({ name: "publication_get", arguments: {} })))
      .toEqual([{ slug: "fieldnotes" }]);
    expect(text(await mcp.callTool({
      name: "posts_list",
      arguments: { search: "draft", status: "draft" },
    }))).toMatchObject({ total: 1 });
    expect(list).toHaveBeenCalledWith({
      search: "draft",
      status: "draft",
      page: 1,
      pageSize: 20,
    });

    const id = "11111111-1111-4111-8111-111111111111";
    await mcp.callTool({ name: "posts_get", arguments: { id } });
    await mcp.callTool({
      name: "posts_create",
      arguments: {
        blogId: id,
        authorId: id,
        title: "Draft",
        slug: "draft",
      },
    });
    await mcp.callTool({
      name: "posts_update",
      arguments: { id, body: { title: "Updated" } },
    });
    await mcp.callTool({ name: "posts_archive", arguments: { id } });
    expect(get).toHaveBeenCalledWith({ params: { id } });
    expect(create).toHaveBeenCalledWith({
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
    expect(update).toHaveBeenCalledWith({
      params: { id },
      body: { title: "Updated" },
    });
    expect(archive).toHaveBeenCalledWith({ params: { id } });
  });
});
