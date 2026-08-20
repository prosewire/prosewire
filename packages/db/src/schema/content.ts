import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const blog = pgTable("blog", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  locale: text("locale").notNull().default("en"),
  accentColor: text("accent_color").notNull().default("#f06445"),
  customCss: text("custom_css").notNull().default(""),
  publicUrl: text("public_url"),
  ...timestamps,
});

export const author = pgTable(
  "author",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blogId: uuid("blog_id")
      .notNull()
      .references(() => blog.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    jobTitle: text("job_title"),
    credentials: text("credentials"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("author_blog_slug_unique").on(table.blogId, table.slug)],
);

export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blogId: uuid("blog_id")
      .notNull()
      .references(() => blog.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [uniqueIndex("category_blog_slug_unique").on(table.blogId, table.slug)],
);

export const post = pgTable(
  "post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blogId: uuid("blog_id")
      .notNull()
      .references(() => blog.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => author.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    contentMarkdown: text("content_markdown").notNull().default(""),
    contentHtml: text("content_html").notNull().default(""),
    coverImageUrl: text("cover_image_url"),
    coverImageAlt: text("cover_image_alt"),
    status: text("status", { enum: ["draft", "scheduled", "published", "archived"] })
      .notNull()
      .default("draft"),
    locale: text("locale").notNull().default("en"),
    featured: boolean("featured").notNull().default(false),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    focusKeyword: text("focus_keyword"),
    canonicalUrl: text("canonical_url"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("post_blog_slug_unique").on(table.blogId, table.slug),
    index("post_blog_status_published_idx").on(table.blogId, table.status, table.publishedAt),
    check(
      "post_status_check",
      sql`${table.status} in ('draft', 'scheduled', 'published', 'archived')`,
    ),
    check(
      "post_status_timestamp_check",
      sql`(${table.status} <> 'scheduled' or ${table.scheduledAt} is not null) and (${table.status} <> 'published' or ${table.publishedAt} is not null) and (${table.status} <> 'archived' or ${table.archivedAt} is not null)`,
    ),
    index("post_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${table.title} || ' ' || ${table.excerpt} || ' ' || ${table.contentMarkdown})`,
    ),
  ],
);

export const postCategory = pgTable(
  "post_category",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.categoryId] })],
);

export const postRevision = pgTable(
  "post_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    editorId: text("editor_id").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("post_revision_version_unique").on(table.postId, table.version),
    index("post_revision_post_idx").on(table.postId, table.createdAt),
  ],
);

export const redirect = pgTable(
  "redirect",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blogId: uuid("blog_id")
      .notNull()
      .references(() => blog.id, { onDelete: "cascade" }),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    statusCode: integer("status_code").notNull().default(301),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("redirect_blog_path_unique").on(table.blogId, table.fromPath),
    check(
      "redirect_status_code_check",
      sql`${table.statusCode} in (301, 302, 307, 308)`,
    ),
  ],
);

export const snippet = pgTable(
  "snippet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blogId: uuid("blog_id")
      .notNull()
      .references(() => blog.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull(),
    contentMarkdown: text("content_markdown").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("snippet_blog_key_unique").on(table.blogId, table.key)],
);

export const apiKey = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blogId: uuid("blog_id")
      .notNull()
      .references(() => blog.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scopes: text("scopes").array().notNull().default(["content:read"]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("api_key_prefix_idx").on(table.prefix)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    blogId: uuid("blog_id").references(() => blog.id, { onDelete: "set null" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_blog_created_idx").on(table.blogId, table.createdAt),
    index("audit_log_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const postView = pgTable(
  "post_view",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().defaultRandom().unique(),
    postId: uuid("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    referrer: text("referrer"),
    country: text("country"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("post_view_post_occurred_idx").on(table.postId, table.occurredAt)],
);

export const blogRelations = relations(blog, ({ one, many }) => ({
  workspace: one(organization, { fields: [blog.organizationId], references: [organization.id] }),
  authors: many(author),
  categories: many(category),
  posts: many(post),
}));

export const authorRelations = relations(author, ({ one, many }) => ({
  blog: one(blog, { fields: [author.blogId], references: [blog.id] }),
  posts: many(post),
}));

export const categoryRelations = relations(category, ({ one, many }) => ({
  blog: one(blog, { fields: [category.blogId], references: [blog.id] }),
  posts: many(postCategory),
}));

export const postRelations = relations(post, ({ one, many }) => ({
  blog: one(blog, { fields: [post.blogId], references: [blog.id] }),
  author: one(author, { fields: [post.authorId], references: [author.id] }),
  categories: many(postCategory),
  revisions: many(postRevision),
  views: many(postView),
}));

export const postCategoryRelations = relations(postCategory, ({ one }) => ({
  post: one(post, { fields: [postCategory.postId], references: [post.id] }),
  category: one(category, { fields: [postCategory.categoryId], references: [category.id] }),
}));

export const postRevisionRelations = relations(postRevision, ({ one }) => ({
  post: one(post, { fields: [postRevision.postId], references: [post.id] }),
}));

export const postViewRelations = relations(postView, ({ one }) => ({
  post: one(post, { fields: [postView.postId], references: [post.id] }),
}));
