import { oc } from "@orpc/contract";
import { z } from "zod";
import { mcpMeta } from "./mcp.ts";
import {
  blogOutput,
  paginatedPosts,
  postCreateInput,
  postOutput,
  postUpdateInput,
} from "./schemas.ts";

const postId = z.object({ params: z.object({ id: z.string().uuid() }) });

export const contract = {
  health: oc
    .meta(mcpMeta({ expose: true, riskLevel: "safe" }))
    .route({ method: "GET", path: "/health", summary: "Database readiness probe" })
    .output(z.object({ status: z.literal("ok"), version: z.string() })),
  blogs: {
    list: oc
      .meta(mcpMeta({ expose: true, riskLevel: "safe" }))
      .route({ method: "GET", path: "/blogs", summary: "List blogs" })
      .output(z.array(blogOutput)),
  },
  posts: {
    list: oc
      .meta(mcpMeta({ expose: true, riskLevel: "safe" }))
      .route({ method: "GET", path: "/posts", summary: "List posts" })
      .input(
        z.object({
          blog: z.string().optional(),
          search: z.string().optional(),
          status: z.enum(["draft", "scheduled", "published", "archived"]).optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        }),
      )
      .output(paginatedPosts),
    get: oc
      .meta(mcpMeta({ expose: true, riskLevel: "safe" }))
      .route({ method: "GET", path: "/posts/{id}", summary: "Get a post", inputStructure: "detailed" })
      .input(postId)
      .output(postOutput),
    create: oc
      .meta(mcpMeta({ expose: true, riskLevel: "mutating" }))
      .route({ method: "POST", path: "/posts", summary: "Create a post" })
      .input(postCreateInput)
      .output(postOutput),
    update: oc
      .meta(mcpMeta({ expose: true, riskLevel: "mutating" }))
      .route({ method: "PATCH", path: "/posts/{id}", summary: "Update a post", inputStructure: "detailed" })
      .input(z.object({ params: z.object({ id: z.string().uuid() }), body: postUpdateInput }))
      .output(postOutput),
    archive: oc
      .meta(mcpMeta({ expose: true, riskLevel: "destructive" }))
      .route({ method: "DELETE", path: "/posts/{id}", summary: "Archive a post", inputStructure: "detailed" })
      .input(postId)
      .output(z.object({ ok: z.literal(true) })),
  },
};

export type Contract = typeof contract;
