"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { changeRequiredPassword as runChangeRequiredPassword } from "./account-entrypoints.ts";
import { actionErrorRedirect } from "./action-errors.ts";
import { decodeErrorTag, decodeTaggedError } from "./boundary-errors.ts";
import {
  bulkArchive as runBulkArchive,
  restorePostRevision as runRestorePostRevision,
  savePost as runSavePost,
  updateBlogSettings as runUpdateBlogSettings,
  type SavePostBoundaryInput,
} from "./mutation-entrypoints.ts";
import {
  acceptInvitation as runAcceptInvitation,
  cancelInvitation as runCancelInvitation,
  createApiKey as runCreateApiKey,
  createPublication as runCreatePublication,
  createWorkspace as runCreateWorkspace,
  inviteMember as runInviteMember,
  removeMember as runRemoveMember,
  revokeApiKey as runRevokeApiKey,
  switchPublication as runSwitchPublication,
  switchWorkspace as runSwitchWorkspace,
  updateMemberRole as runUpdateMemberRole,
  updateWorkspace as runUpdateWorkspace,
} from "./workspace-entrypoints.ts";

const publicationCookie = "prosewire-publication";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function rawText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function nullableText(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

function internalPath(value: string, fallback: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

async function setPublicationCookie(blogId: string): Promise<void> {
  (await cookies()).set(publicationCookie, blogId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
  });
}

async function authorizedMutation<A>(operation: Promise<A>): Promise<A> {
  try {
    return await operation;
  } catch (error) {
    if (isAccessDenied(error)) {
      forbidden();
    }
    throw error;
  }
}

function isAccessDenied(error: unknown): boolean {
  const tag = decodeErrorTag(error);
  return tag === "BlogAccessDenied" || tag === "WorkspaceAccessDenied";
}

function redirectActionError(error: unknown, fallbackPath: string): never {
  if (isAccessDenied(error)) {
    forbidden();
  }
  const tagged = decodeTaggedError(error);
  const destination = tagged
    ? actionErrorRedirect(tagged, fallbackPath)
    : undefined;
  if (destination) redirect(destination);
  throw error;
}

function savePostInput(formData: FormData): SavePostBoundaryInput {
  const id = text(formData, "id");
  const scheduledAtValue = text(formData, "scheduledAt");
  return {
    ...(id ? { id } : {}),
    blogId: text(formData, "blogId"),
    authorId: text(formData, "authorId"),
    categoryIds: formData.getAll("categoryId").map(String).filter(Boolean),
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
  revalidatePath(`/b/${result.blogSlug}`);
  redirect(`/posts/${result.savedId}/edit?saved=1`);
}

export async function bulkArchivePosts(formData: FormData): Promise<void> {
  let changed: boolean;
  try {
    changed = await runBulkArchive({
      blogId: text(formData, "blogId"),
      postIds: formData.getAll("postId").map(String).filter(Boolean),
    });
  } catch (error) {
    redirectActionError(error, "/posts");
  }
  if (!changed) return;
  revalidatePath("/posts");
  revalidatePath("/dashboard");
}

export async function restorePostRevision(
  revisionId: string,
  formData: FormData,
): Promise<void> {
  const postId = text(formData, "id");
  let result: Awaited<ReturnType<typeof runRestorePostRevision>>;
  try {
    result = await runRestorePostRevision({
      blogId: text(formData, "blogId"),
      postId,
      revisionId,
    });
  } catch (error) {
    redirectActionError(error, `/posts/${postId}/edit`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/posts");
  revalidatePath(`/posts/${postId}/edit`);
  revalidatePath(`/b/${result.blogSlug}`);
  redirect(`/posts/${postId}/edit?restored=1`);
}

export async function updateBlogSettings(formData: FormData): Promise<void> {
  let blogSlug: string;
  try {
    blogSlug = await runUpdateBlogSettings({
      blogId: text(formData, "id"),
      name: text(formData, "name"),
      description: text(formData, "description"),
      locale: text(formData, "locale") || "en",
      locales: formData.getAll("locales").map(String).filter(Boolean),
      accentColor: text(formData, "accentColor") || "#ef6848",
      publicUrl: nullableText(formData, "publicUrl"),
      customCss: text(formData, "customCss"),
    });
  } catch (error) {
    redirectActionError(error, "/settings");
  }
  revalidatePath("/settings");
  revalidatePath(`/b/${blogSlug}`);
  redirect("/settings?saved=1");
}

export async function changeRequiredPassword(
  formData: FormData,
): Promise<void> {
  const returnTo = internalPath(text(formData, "returnTo"), "/dashboard");
  const newPassword = rawText(formData, "newPassword");
  if (newPassword !== rawText(formData, "confirmPassword")) {
    redirect(
      `/change-password?returnTo=${encodeURIComponent(returnTo)}&error=${encodeURIComponent("The new passwords do not match")}`,
    );
  }
  try {
    await runChangeRequiredPassword({
      currentPassword: rawText(formData, "currentPassword"),
      newPassword,
    });
  } catch (error) {
    redirectActionError(
      error,
      `/change-password?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }
  redirect(
    `/sign-in?passwordChanged=1&returnTo=${encodeURIComponent(returnTo)}`,
  );
}

async function createWorkspaceAndPublication(
  input: Parameters<typeof runCreateWorkspace>[0],
): Promise<never> {
  let result: Awaited<ReturnType<typeof runCreateWorkspace>>;
  try {
    result = await runCreateWorkspace(input);
  } catch (error) {
    redirectActionError(error, "/onboarding");
  }
  await setPublicationCookie(result.blogId);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function createInitialPublication(
  formData: FormData,
): Promise<void> {
  const publicationName = text(formData, "publicationName");
  const publicationSlug = text(formData, "publicationSlug");
  await createWorkspaceAndPublication({
    workspaceName: publicationName,
    workspaceSlug: publicationSlug,
    publicationName,
    publicationSlug,
  });
}

export async function createWorkspace(formData: FormData): Promise<void> {
  await createWorkspaceAndPublication({
    workspaceName: text(formData, "workspaceName"),
    workspaceSlug: text(formData, "workspaceSlug"),
    publicationName: text(formData, "publicationName"),
    publicationSlug: text(formData, "publicationSlug"),
  });
}

export async function createPublication(formData: FormData): Promise<void> {
  const blogId = await authorizedMutation(
    runCreatePublication({
      organizationId: text(formData, "organizationId"),
      name: text(formData, "name"),
      slug: text(formData, "slug"),
    }),
  );
  await setPublicationCookie(blogId);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function updateWorkspace(formData: FormData): Promise<void> {
  await authorizedMutation(
    runUpdateWorkspace({
      organizationId: text(formData, "organizationId"),
      name: text(formData, "name"),
    }),
  );
  revalidatePath("/dashboard", "layout");
  redirect("/settings?workspaceSaved=1");
}

export async function switchWorkspace(formData: FormData): Promise<void> {
  const blogId = await authorizedMutation(
    runSwitchWorkspace(text(formData, "organizationId")),
  );
  const cookieStore = await cookies();
  if (blogId) {
    await setPublicationCookie(blogId);
  } else {
    cookieStore.delete(publicationCookie);
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function switchPublication(formData: FormData): Promise<void> {
  const authorization = await authorizedMutation(
    runSwitchPublication(text(formData, "publicationId")),
  );
  await setPublicationCookie(authorization.blog.id);
  revalidatePath("/dashboard", "layout");
  redirect(internalPath(text(formData, "returnTo"), "/dashboard"));
}

export async function inviteMember(formData: FormData): Promise<void> {
  await authorizedMutation(
    runInviteMember({
      organizationId: text(formData, "organizationId"),
      email: text(formData, "email"),
      role: text(formData, "role"),
    }),
  );
  revalidatePath("/team");
  redirect("/team?invited=1");
}

export async function updateMemberRole(formData: FormData): Promise<void> {
  await authorizedMutation(
    runUpdateMemberRole({
      organizationId: text(formData, "organizationId"),
      memberId: text(formData, "memberId"),
      role: text(formData, "role"),
    }),
  );
  revalidatePath("/team");
}

export async function removeMember(formData: FormData): Promise<void> {
  await authorizedMutation(
    runRemoveMember({
      organizationId: text(formData, "organizationId"),
      memberId: text(formData, "memberId"),
    }),
  );
  revalidatePath("/team");
}

export async function cancelInvitation(formData: FormData): Promise<void> {
  await authorizedMutation(
    runCancelInvitation({
      organizationId: text(formData, "organizationId"),
      invitationId: text(formData, "invitationId"),
    }),
  );
  revalidatePath("/team");
}

export async function acceptInvitation(formData: FormData): Promise<void> {
  const blogId = await runAcceptInvitation(text(formData, "invitationId"));
  if (blogId) await setPublicationCookie(blogId);
  revalidatePath("/dashboard", "layout");
  redirect(blogId ? "/dashboard" : "/onboarding");
}

export type ApiKeyActionState = { apiKey?: string; error?: string };

export async function createApiKey(
  _state: ApiKeyActionState,
  formData: FormData,
): Promise<ApiKeyActionState> {
  try {
    const apiKey = await runCreateApiKey({
      blogId: text(formData, "blogId"),
      name: text(formData, "name"),
      allowWrite: formData.get("write") === "on",
    });
    revalidatePath("/integrate");
    return { apiKey };
  } catch (error) {
    if (isAccessDenied(error)) {
      forbidden();
    }
    return {
      error:
        error instanceof Error ? error.message : "Unable to create API key",
    };
  }
}

export async function revokeApiKey(formData: FormData): Promise<void> {
  await authorizedMutation(
    runRevokeApiKey({
      blogId: text(formData, "blogId"),
      apiKeyId: text(formData, "apiKeyId"),
    }),
  );
  revalidatePath("/integrate");
}
