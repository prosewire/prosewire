import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract, type Contract } from "@prosewire/contract";

export interface ProsewireClientOptions {
  /** Base URL of a Prosewire deployment, e.g. https://blog.example.com. */
  baseUrl: string;
  /** Private API key. Public rendered/raw endpoints do not need one. */
  apiKey?: string;
  fetch?: typeof fetch;
}

export type Client = ContractRouterClient<Contract>;

export function createClient(options: ProsewireClientOptions): Client {
  const link = new OpenAPILink(contract, {
    url: `${options.baseUrl.replace(/\/$/, "")}/api/v1`,
    headers: () =>
      options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return createORPCClient(link) satisfies Client;
}

export interface PublicContentClient {
  listPosts(input?: { search?: string; category?: string; limit?: number }): Promise<unknown>;
  getPost(slug: string): Promise<unknown>;
  getRendered(path?: string): Promise<string>;
}

export function createPublicClient(
  options: Pick<ProsewireClientOptions, "baseUrl" | "fetch"> & { blog: string },
): PublicContentClient {
  const request = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  return {
    async listPosts(input = {}) {
      const query = new URLSearchParams();
      if (input.search) query.set("search", input.search);
      if (input.category) query.set("category", input.category);
      if (input.limit) query.set("limit", String(input.limit));
      const response = await request(`${base}/api/public/${options.blog}/posts?${query.toString()}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.json();
    },
    async getPost(slug) {
      const response = await request(`${base}/api/public/${options.blog}/posts/${slug}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.json();
    },
    async getRendered(path = "") {
      const response = await request(`${base}/api/rendered/${options.blog}/${path.replace(/^\//, "")}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.text();
    },
  };
}
