"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { BlogAccessDenied } from "./authorization.ts";
import { actionErrorRedirect } from "./action-errors.ts";
import {
  bulkArchive as runBulkArchive,
  savePost as runSavePost,
  type SavePostBoundaryInput,
  updateBlogSettings as runUpdateBlogSettings,
} from "./mutation-entrypoints.ts";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

function taggedError(error: unknown): ({ readonly _tag: string } & Error) | undefined {
  return error instanceof Error && "_tag" in error
    ? (error as { readonly _tag: string } & Error)
    : undefined;
}

function redirectActionError(error: unknown, fallbackPath: string): never {
  if (error instanceof BlogAccessDenied) forbidden();
  const tagged = taggedError(error);
  const destination = tagged
    ? actionErrorRedirect(tagged, fallbackPath)
    : undefined;
  if (destination) redirect(destination);
  throw error;
}

function savePostInput(formData: FormData): SavePostBoundaryInput {
  const id = text(formData, "id");
  const categoryId = text(formData, "categoryId");
  const scheduledAtValue = text(formData, "scheduledAt");
  return {
    ...(id ? { id } : {}),
    blogId: text(formData, "blogId"),
    authorId: text(formData, "authorId"),
    ...(categoryId ? { categoryId } : {}),
    title: text(formData, "title"),
    requestedSlug: text(formData, "slug"),
    excerpt: text(formData, "excerpt"),
    contentMarkdown: text(formData, "contentMarkdown"),
    requestedStatus: text(formData, "status"),
    featured: formData.get("featured") === "on",
    locale: text(formData, "locale") || "en",
    coverImageUrl: nullableText(formData, "coverImageUrl"),
    coverImageAlt: nullableText(formData, "coverImageAlt"),
    seoTitle: nullableText(formData, "seoTitle"),
    seoDescription: nullableText(formData, "seoDescription"),
    focusKeyword: nullableText(formData, "focusKeyword"),
    canonicalUrl: nullableText(formData, "canonicalUrl"),
    scheduledAt: scheduledAtValue || null,
  };
}

export async function savePost(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  let result: Awaited<ReturnType<typeof runSavePost>>;
  try {
    result = await runSavePost(savePostInput(formData));
  } catch (error) {
    redirectActionError(error, id ? `/posts/${id}/edit` : "/posts/new");
  }
  revalidatePath("/dashboard");
  revalidatePath("/posts");
  revalidatePath(`/b/${result.defaultBlog}`);
  redirect(`/posts/${result.savedId}/edit?saved=1`);
}

export async function bulkArchivePosts(formData: FormData): Promise<void> {
  let changed: boolean;
  try {
    changed = await runBulkArchive({
      blogId: text(formData, "blogId"),
      postIds: formData
        .getAll("postId")
        .map(String)
        .filter(Boolean),
    });
  } catch (error) {
    redirectActionError(error, "/posts");
  }
  if (!changed) return;
  revalidatePath("/posts");
  revalidatePath("/dashboard");
}

export async function updateBlogSettings(formData: FormData): Promise<void> {
  let defaultBlog: string;
  try {
    defaultBlog = await runUpdateBlogSettings({
      blogId: text(formData, "id"),
      name: text(formData, "name"),
      description: text(formData, "description"),
      locale: text(formData, "locale") || "en",
      accentColor: text(formData, "accentColor") || "#ef6848",
      publicUrl: nullableText(formData, "publicUrl"),
      customCss: text(formData, "customCss"),
    });
  } catch (error) {
    redirectActionError(error, "/settings");
  }
  revalidatePath("/settings");
  revalidatePath(`/b/${defaultBlog}`);
  redirect("/settings?saved=1");
}
