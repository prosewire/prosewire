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

export interface PublicBlog {
  id: string;
  name: string;
  slug: string;
  description: string;
  locale: string;
  accentColor: string;
  publicUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAuthor {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  credentials: string | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface PublicPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMarkdown: string;
  contentHtml: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  locale: string;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  readingMinutes: number;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  author: PublicAuthor;
  categories: PublicCategory[];
}

export interface PublicPostPage {
  blog: PublicBlog;
  posts: PublicPost[];
  categories: PublicCategory[];
  pagination: { page: number; pageSize: number; hasMore: boolean };
}

export interface PublicPostResult {
  blog: PublicBlog;
  post: PublicPost;
}

export interface PublicListInput {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  /** @deprecated Use pageSize. */
  limit?: number;
}

export interface PublicContentClient {
  listPosts(input?: PublicListInput): Promise<PublicPostPage>;
  getPost(slug: string): Promise<PublicPostResult>;
  getRendered(path?: string): Promise<string>;
}

export function createPublicClient(
  options: Pick<ProsewireClientOptions, "baseUrl" | "fetch"> & { blog: string },
): PublicContentClient {
  const request = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const blog = encodeURIComponent(options.blog);
  return {
    async listPosts(input = {}) {
      const query = new URLSearchParams();
      if (input.search) query.set("search", input.search);
      if (input.category) query.set("category", input.category);
      if (input.page) query.set("page", String(input.page));
      if (input.pageSize) query.set("pageSize", String(input.pageSize));
      if (input.limit) query.set("limit", String(input.limit));
      const suffix = query.size ? `?${query.toString()}` : "";
      const response = await request(`${base}/api/public/${blog}/posts${suffix}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.json() as Promise<PublicPostPage>;
    },
    async getPost(slug) {
      const response = await request(`${base}/api/public/${blog}/posts/${encodeURIComponent(slug)}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.json() as Promise<PublicPostResult>;
    },
    async getRendered(path = "") {
      const encodedPath = path.replace(/^\//, "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
      const response = await request(`${base}/api/rendered/${blog}/${encodedPath}`);
      if (!response.ok) throw new Error(`Prosewire request failed (${String(response.status)})`);
      return response.text();
    },
  };
}
