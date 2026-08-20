import { z } from "zod";

export const postStatus = z.enum(["draft", "scheduled", "published", "archived"]);

export const authorOutput = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  jobTitle: z.string().nullable(),
  credentials: z.string().nullable(),
});

export const categoryOutput = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
});

export const postOutput = z.object({
  id: z.string().uuid(),
  blogId: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  contentMarkdown: z.string(),
  contentHtml: z.string(),
  coverImageUrl: z.string().nullable(),
  coverImageAlt: z.string().nullable(),
  status: postStatus,
  locale: z.string(),
  featured: z.boolean(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  focusKeyword: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  scheduledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  author: authorOutput,
  categories: z.array(categoryOutput),
});

const postMutableFields = {
  authorId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(120),
  excerpt: z.string().max(500),
  contentMarkdown: z.string(),
  coverImageUrl: z.url().nullable(),
  coverImageAlt: z.string().max(180).nullable(),
  status: postStatus,
  locale: z.string().min(2).max(10),
  featured: z.boolean(),
  seoTitle: z.string().max(70).nullable(),
  seoDescription: z.string().max(180).nullable(),
  focusKeyword: z.string().max(120).nullable(),
  canonicalUrl: z.url().nullable(),
  scheduledAt: z.iso.datetime().nullable(),
  categoryIds: z.array(z.string().uuid()),
};

export const postCreateInput = z.object({
  blogId: z.string().uuid(),
  ...postMutableFields,
  excerpt: postMutableFields.excerpt.optional(),
  contentMarkdown: postMutableFields.contentMarkdown.default(""),
  coverImageUrl: postMutableFields.coverImageUrl.optional(),
  coverImageAlt: postMutableFields.coverImageAlt.optional(),
  status: postMutableFields.status.default("draft"),
  locale: postMutableFields.locale.default("en"),
  featured: postMutableFields.featured.default(false),
  seoTitle: postMutableFields.seoTitle.optional(),
  seoDescription: postMutableFields.seoDescription.optional(),
  focusKeyword: postMutableFields.focusKeyword.optional(),
  canonicalUrl: postMutableFields.canonicalUrl.optional(),
  scheduledAt: postMutableFields.scheduledAt.optional(),
  categoryIds: postMutableFields.categoryIds.default([]),
});

export const postUpdateInput = z.object(postMutableFields).partial();

export const blogOutput = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  locale: z.string(),
  accentColor: z.string(),
  customCss: z.string(),
  publicUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const paginatedPosts = z.object({
  items: z.array(postOutput),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
