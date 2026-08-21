import type {
  PostStatus,
  PublicBlog,
  PublicPost,
} from "@prosewire/contract";
import { readingMinutes } from "@prosewire/core";

interface PublicBlogRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  locale: string;
  accentColor: string;
  publicUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializePublicBlog(blog: PublicBlogRow): PublicBlog {
  return {
    id: blog.id,
    name: blog.name,
    slug: blog.slug,
    description: blog.description,
    locale: blog.locale,
    accentColor: blog.accentColor,
    publicUrl: blog.publicUrl,
    createdAt: blog.createdAt.toISOString(),
    updatedAt: blog.updatedAt.toISOString(),
  };
}

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMarkdown: string;
  contentHtml: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  status: PostStatus;
  locale: string;
  featured: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  author: {
    id: string;
    name: string;
    slug: string;
    bio: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
    credentials: string | null;
  };
  categories: ReadonlyArray<{
    category: { id: string; name: string; slug: string; description: string | null };
  }>;
}

export function serializePublicPost(row: PostRow): PublicPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentMarkdown: row.contentMarkdown,
    contentHtml: row.contentHtml,
    coverImageUrl: row.coverImageUrl,
    coverImageAlt: row.coverImageAlt,
    status: row.status,
    locale: row.locale,
    featured: row.featured,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: readingMinutes(row.contentMarkdown),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
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
