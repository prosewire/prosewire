import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Client } from "@prosewire/sdk";

export function createProsewireMcpServer(client: Client, version = "0.1.0"): McpServer {
  const server = new McpServer(
    { name: "prosewire", version },
    {
      instructions:
        "Manage the single publication scoped to PROSEWIRE_API_KEY. Read-only tools are marked safe. Confirm with the user before mutating or archiving content.",
    },
  );

  server.registerTool(
    "publication_get",
    {
      title: "Get active publication",
      description: "Return the publication scoped to this API key (safe, read-only).",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(await client.blogs.list(), null, 2) }],
    }),
  );

  server.registerTool(
    "posts_list",
    {
      title: "List posts",
      description: "List and search posts in the API key's publication (safe, read-only).",
      inputSchema: {
        blog: z.string().optional(),
        search: z.string().optional(),
        status: z.enum(["draft", "scheduled", "published", "archived"]).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await client.posts.list(args), null, 2) }],
    }),
  );

  server.registerTool(
    "posts_get",
    {
      title: "Get post",
      description: "Retrieve a post by its UUID (safe, read-only).",
      inputSchema: { id: z.uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ id }) => ({
      content: [{ type: "text", text: JSON.stringify(await client.posts.get({ params: { id } }), null, 2) }],
    }),
  );

  server.registerTool(
    "posts_archive",
    {
      title: "Archive post",
      description: "Archive a post (destructive — confirm with the user first).",
      inputSchema: { id: z.uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => ({
      content: [{ type: "text", text: JSON.stringify(await client.posts.archive({ params: { id } }), null, 2) }],
    }),
  );

  return server;
}
