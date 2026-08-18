import { and, asc, count, desc, eq, ilike, isNotNull, lte, or, sql } from "drizzle-orm";
import { schema } from "@prosewire/db";
import { db } from "@/lib/db";

export async function getDefaultBlog() {
  const slug = process.env["PROSEWIRE_DEFAULT_BLOG"] ?? "fieldnotes";
  return (await db().query.blog.findFirst({ where: eq(schema.blog.slug, slug) })) ?? (await db().query.blog.findFirst());
}

export async function getAuthors(blogId: string) {
  return db().query.author.findMany({
    where: eq(schema.author.blogId, blogId),
    orderBy: [asc(schema.author.name)],
  });
}

export async function getCategories(blogId: string) {
  return db().query.category.findMany({
    where: eq(schema.category.blogId, blogId),
    orderBy: [asc(schema.category.name)],
  });
}

export async function getDashboardPosts(blogId: string, search?: string) {
  return db().query.post.findMany({
    where: search?.trim()
      ? and(
          eq(schema.post.blogId, blogId),
          or(
            ilike(schema.post.title, `%${search.trim()}%`),
            ilike(schema.post.excerpt, `%${search.trim()}%`),
          ),
        )
      : eq(schema.post.blogId, blogId),
    with: { author: true, categories: { with: { category: true } }, views: true },
    orderBy: [desc(schema.post.updatedAt)],
  });
}

export async function getDashboardPost(id: string) {
  return db().query.post.findFirst({
    where: eq(schema.post.id, id),
    with: { author: true, categories: { with: { category: true } }, revisions: true },
  });
}

export async function getDashboardMetrics(blogId: string) {
  const [postCounts, authorCount, viewCount] = await Promise.all([
    db()
      .select({ status: schema.post.status, value: count() })
      .from(schema.post)
      .where(eq(schema.post.blogId, blogId))
      .groupBy(schema.post.status),
    db().$count(schema.author, eq(schema.author.blogId, blogId)),
    db()
      .select({ value: count() })
      .from(schema.postView)
      .innerJoin(schema.post, eq(schema.postView.postId, schema.post.id))
      .where(eq(schema.post.blogId, blogId)),
  ]);
  const byStatus = Object.fromEntries(postCounts.map((row) => [row.status, Number(row.value)]));
  return {
    total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
    published: byStatus["published"] ?? 0,
    drafts: byStatus["draft"] ?? 0,
    scheduled: byStatus["scheduled"] ?? 0,
    authors: authorCount,
    views: Number(viewCount[0]?.value ?? 0),
  };
}

export async function getViewSeries(blogId: string) {
  const rows = await db()
    .select({
      day: sql<string>`to_char(date_trunc('day', ${schema.postView.occurredAt}), 'Mon DD')`,
      value: count(),
    })
    .from(schema.postView)
    .innerJoin(schema.post, eq(schema.postView.postId, schema.post.id))
    .where(eq(schema.post.blogId, blogId))
    .groupBy(sql`date_trunc('day', ${schema.postView.occurredAt})`)
    .orderBy(sql`date_trunc('day', ${schema.postView.occurredAt})`);
  return rows.map((row) => ({ day: row.day, value: Number(row.value) }));
}

export async function getPublicBlog(slug: string) {
  return db().query.blog.findFirst({ where: eq(schema.blog.slug, slug) });
}

export async function getPublicPosts(
  blogId: string,
  options: { search?: string; category?: string; limit?: number } = {},
) {
  const now = new Date();
  const filters = [
    eq(schema.post.blogId, blogId),
    eq(schema.post.status, "published"),
    isNotNull(schema.post.publishedAt),
    lte(schema.post.publishedAt, now),
  ];
  if (options.search?.trim()) {
    filters.push(
      sql<boolean>`to_tsvector('english', ${schema.post.title} || ' ' || ${schema.post.excerpt} || ' ' || ${schema.post.contentMarkdown}) @@ plainto_tsquery('english', ${options.search.trim()})`,
    );
  }
  const rows = await db().query.post.findMany({
    where: and(...filters),
    with: { author: true, categories: { with: { category: true } } },
    orderBy: [desc(schema.post.featured), desc(schema.post.publishedAt)],
    limit: options.limit ?? 50,
  });
  if (!options.category) return rows;
  return rows.filter((row) => row.categories.some((entry) => entry.category.slug === options.category));
}

export async function getPublicPost(blogId: string, slug: string) {
  return db().query.post.findFirst({
    where: and(
      eq(schema.post.blogId, blogId),
      eq(schema.post.slug, slug),
      eq(schema.post.status, "published"),
      isNotNull(schema.post.publishedAt),
      lte(schema.post.publishedAt, new Date()),
    ),
    with: { author: true, categories: { with: { category: true } } },
  });
}
