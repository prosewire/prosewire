import { createHash } from "node:crypto";
import { implement, ORPCError } from "@orpc/server";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { contract } from "@prosewire/contract/router";
import { createExcerpt, renderMarkdown } from "@prosewire/core";
import { schema } from "@prosewire/db";
import { db } from "@/lib/db";

interface RequestContext { request: Request }
const os = implement(contract).$context<RequestContext>();

async function requireApiKey(request: Request): Promise<{ blogId: string }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ORPCError("UNAUTHORIZED", { message: "Bearer API key required" });
  const hash = createHash("sha256").update(token).digest("hex");
  const key = await db().query.apiKey.findFirst({ where: eq(schema.apiKey.keyHash, hash) });
  if (!key || (key.expiresAt && key.expiresAt <= new Date())) {
    throw new ORPCError("UNAUTHORIZED", { message: "Invalid or expired API key" });
  }
  await db().update(schema.apiKey).set({ lastUsedAt: new Date() }).where(eq(schema.apiKey.id, key.id));
  return { blogId: key.blogId };
}

type PostWithRelations = typeof schema.post.$inferSelect & {
  author: typeof schema.author.$inferSelect;
  categories: Array<{ category: typeof schema.category.$inferSelect }>;
};

function postOutput(row: PostWithRelations) {
  return {
    id: row.id,
    blogId: row.blogId,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    contentMarkdown: row.contentMarkdown,
    contentHtml: row.contentHtml,
    coverImageUrl: row.coverImageUrl,
    coverImageAlt: row.coverImageAlt,
    status: row.status,
    locale: row.locale,
    featured: row.featured,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    focusKeyword: row.focusKeyword,
    canonicalUrl: row.canonicalUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      id: row.author.id,
      name: row.author.name,
      slug: row.author.slug,
      bio: row.author.bio,
      avatarUrl: row.author.avatarUrl,
      jobTitle: row.author.jobTitle,
      credentials: row.author.credentials,
    },
    categories: row.categories.map(({ category }) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
    })),
  };
}

const health = os.health.handler(() => ({ status: "ok" as const, version: "0.1.0" }));

const blogsList = os.blogs.list.handler(async ({ context }) => {
  const access = await requireApiKey(context.request);
  const rows = await db().query.blog.findMany({ where: eq(schema.blog.id, access.blogId) });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
});

const postsList = os.posts.list.handler(async ({ input, context }) => {
  const access = await requireApiKey(context.request);
  const filters = [eq(schema.post.blogId, access.blogId)];
  if (input.status) filters.push(eq(schema.post.status, input.status));
  if (input.search?.trim()) {
    const searchFilter = or(ilike(schema.post.title, `%${input.search}%`), ilike(schema.post.excerpt, `%${input.search}%`));
    if (searchFilter) filters.push(searchFilter);
  }
  const where = and(...filters);
  const [rows, totals] = await Promise.all([
    db().query.post.findMany({
      where,
      with: { author: true, categories: { with: { category: true } } },
      orderBy: [desc(schema.post.updatedAt)],
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    }),
    db().select({ value: count() }).from(schema.post).where(where),
  ]);
  return { items: rows.map(postOutput), total: Number(totals[0]?.value ?? 0), page: input.page, pageSize: input.pageSize };
});

const postsGet = os.posts.get.handler(async ({ input, context }) => {
  const access = await requireApiKey(context.request);
  const row = await db().query.post.findFirst({
    where: and(eq(schema.post.id, input.params.id), eq(schema.post.blogId, access.blogId)),
    with: { author: true, categories: { with: { category: true } } },
  });
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Post not found" });
  return postOutput(row);
});

const postsCreate = os.posts.create.handler(async ({ input, context }) => {
  const access = await requireApiKey(context.request);
  if (input.blogId !== access.blogId) throw new ORPCError("FORBIDDEN", { message: "API key does not have access to this blog" });
  const now = new Date();
  const [created] = await db().insert(schema.post).values({
    blogId: input.blogId,
    authorId: input.authorId,
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt ?? createExcerpt(input.contentMarkdown),
    contentMarkdown: input.contentMarkdown,
    contentHtml: await renderMarkdown(input.contentMarkdown),
    coverImageUrl: input.coverImageUrl ?? null,
    coverImageAlt: input.coverImageAlt ?? null,
    status: input.status,
    locale: input.locale,
    featured: input.featured,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
    focusKeyword: input.focusKeyword ?? null,
    canonicalUrl: input.canonicalUrl ?? null,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    publishedAt: input.status === "published" ? now : null,
  }).returning();
  if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Unable to create post" });
  if (input.categoryIds.length) await db().insert(schema.postCategory).values(input.categoryIds.map((categoryId) => ({ postId: created.id, categoryId })));
  const row = await db().query.post.findFirst({ where: eq(schema.post.id, created.id), with: { author: true, categories: { with: { category: true } } } });
  if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Unable to load created post" });
  return postOutput(row);
});

const postsUpdate = os.posts.update.handler(async ({ input, context }) => {
  const access = await requireApiKey(context.request);
  const existing = await db().query.post.findFirst({ where: and(eq(schema.post.id, input.params.id), eq(schema.post.blogId, access.blogId)) });
  if (!existing) throw new ORPCError("NOT_FOUND", { message: "Post not found" });
  const patch = input.body;
  const latest = await db().query.postRevision.findFirst({ where: eq(schema.postRevision.postId, existing.id), orderBy: [desc(schema.postRevision.version)] });
  await db().transaction(async (tx) => {
    await tx.insert(schema.postRevision).values({ postId: existing.id, version: (latest?.version ?? 0) + 1, snapshot: existing });
    if (patch.slug && patch.slug !== existing.slug) {
      await tx.insert(schema.redirect).values({ blogId: existing.blogId, fromPath: existing.slug, toPath: patch.slug }).onConflictDoUpdate({ target: [schema.redirect.blogId, schema.redirect.fromPath], set: { toPath: patch.slug } });
    }
    await tx.update(schema.post).set({
      ...(patch.authorId ? { authorId: patch.authorId } : {}),
      ...(patch.title ? { title: patch.title } : {}),
      ...(patch.slug ? { slug: patch.slug } : {}),
      ...(patch.excerpt !== undefined ? { excerpt: patch.excerpt } : {}),
      ...(patch.contentMarkdown !== undefined ? { contentMarkdown: patch.contentMarkdown, contentHtml: await renderMarkdown(patch.contentMarkdown) } : {}),
      ...(patch.coverImageUrl !== undefined ? { coverImageUrl: patch.coverImageUrl } : {}),
      ...(patch.coverImageAlt !== undefined ? { coverImageAlt: patch.coverImageAlt } : {}),
      ...(patch.status ? { status: patch.status, publishedAt: patch.status === "published" ? new Date() : existing.publishedAt } : {}),
      ...(patch.locale ? { locale: patch.locale } : {}),
      ...(patch.featured !== undefined ? { featured: patch.featured } : {}),
      ...(patch.seoTitle !== undefined ? { seoTitle: patch.seoTitle } : {}),
      ...(patch.seoDescription !== undefined ? { seoDescription: patch.seoDescription } : {}),
      ...(patch.focusKeyword !== undefined ? { focusKeyword: patch.focusKeyword } : {}),
      ...(patch.canonicalUrl !== undefined ? { canonicalUrl: patch.canonicalUrl } : {}),
      ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : null } : {}),
      updatedAt: new Date(),
    }).where(eq(schema.post.id, existing.id));
    if (patch.categoryIds) {
      await tx.delete(schema.postCategory).where(eq(schema.postCategory.postId, existing.id));
      if (patch.categoryIds.length) await tx.insert(schema.postCategory).values(patch.categoryIds.map((categoryId) => ({ postId: existing.id, categoryId })));
    }
  });
  const row = await db().query.post.findFirst({ where: eq(schema.post.id, existing.id), with: { author: true, categories: { with: { category: true } } } });
  if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Unable to load updated post" });
  return postOutput(row);
});

const postsArchive = os.posts.archive.handler(async ({ input, context }) => {
  const access = await requireApiKey(context.request);
  const rows = await db().update(schema.post).set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.post.id, input.params.id), eq(schema.post.blogId, access.blogId))).returning({ id: schema.post.id });
  if (!rows.length) throw new ORPCError("NOT_FOUND", { message: "Post not found" });
  return { ok: true as const };
});

export const router = os.router({
  health,
  blogs: { list: blogsList },
  posts: { list: postsList, get: postsGet, create: postsCreate, update: postsUpdate, archive: postsArchive },
});
