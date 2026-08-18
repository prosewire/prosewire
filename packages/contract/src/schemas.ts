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

export const postCreateInput = z.object({
  blogId: z.string().uuid(),
  authorId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(120),
  excerpt: z.string().max(500).optional(),
  contentMarkdown: z.string().default(""),
  coverImageUrl: z.url().nullable().optional(),
  coverImageAlt: z.string().max(180).nullable().optional(),
  status: postStatus.default("draft"),
  locale: z.string().min(2).max(10).default("en"),
  featured: z.boolean().default(false),
  seoTitle: z.string().max(70).nullable().optional(),
  seoDescription: z.string().max(180).nullable().optional(),
  focusKeyword: z.string().max(120).nullable().optional(),
  canonicalUrl: z.url().nullable().optional(),
  scheduledAt: z.iso.datetime().nullable().optional(),
  categoryIds: z.array(z.string().uuid()).default([]),
});

export const postUpdateInput = postCreateInput.omit({ blogId: true }).partial();

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
