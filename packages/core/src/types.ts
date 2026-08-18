export type PostStatus = "draft" | "scheduled" | "published" | "archived";
export type TeamRole = "owner" | "admin" | "editor" | "author" | "viewer";

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
  status: PostStatus;
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

export interface PublicBlog {
  id: string;
  name: string;
  slug: string;
  description: string;
  locale: string;
  accentColor: string;
  customCss: string;
  publicUrl: string | null;
}
