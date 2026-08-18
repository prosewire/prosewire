"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createExcerpt, renderMarkdown, slugify } from "@prosewire/core";
import { schema } from "@prosewire/db";
import { db } from "@/lib/db";
import { requireDashboardSession } from "@/lib/session";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

export async function savePost(formData: FormData): Promise<void> {
  const session = await requireDashboardSession();
  const id = text(formData, "id");
  const blogId = text(formData, "blogId");
  const title = text(formData, "title");
  const contentMarkdown = text(formData, "contentMarkdown");
  const requestedStatus = text(formData, "status") as "draft" | "scheduled" | "published";
  const scheduledAtValue = text(formData, "scheduledAt");
  const scheduledAt = scheduledAtValue ? new Date(scheduledAtValue) : null;
  const status = requestedStatus === "scheduled" && !scheduledAt ? "draft" : requestedStatus;
  if (!title || !blogId) throw new Error("Title and blog are required");
  const slug = slugify(text(formData, "slug") || title);
  const categoryId = text(formData, "categoryId");
  const now = new Date();
  const values = {
    title,
    slug,
    excerpt: text(formData, "excerpt") || createExcerpt(contentMarkdown),
    contentMarkdown,
    contentHtml: await renderMarkdown(contentMarkdown),
    authorId: text(formData, "authorId"),
    status,
    featured: formData.get("featured") === "on",
    locale: text(formData, "locale") || "en",
    coverImageUrl: nullableText(formData, "coverImageUrl"),
    coverImageAlt: nullableText(formData, "coverImageAlt"),
    seoTitle: nullableText(formData, "seoTitle"),
    seoDescription: nullableText(formData, "seoDescription"),
    focusKeyword: nullableText(formData, "focusKeyword"),
    canonicalUrl: nullableText(formData, "canonicalUrl"),
    scheduledAt: status === "scheduled" ? scheduledAt : null,
    publishedAt: status === "published" ? now : null,
    archivedAt: null,
    updatedAt: now,
  } satisfies Partial<typeof schema.post.$inferInsert>;

  let savedId = id;
  await db().transaction(async (tx) => {
    if (id) {
      const existing = await tx.query.post.findFirst({ where: eq(schema.post.id, id) });
      if (!existing) throw new Error("Post not found");
      const latest = await tx.query.postRevision.findFirst({
        where: eq(schema.postRevision.postId, id),
        orderBy: [desc(schema.postRevision.version)],
      });
      await tx.insert(schema.postRevision).values({
        postId: id,
        editorId: session.user.id,
        version: (latest?.version ?? 0) + 1,
        snapshot: existing,
      });
      if (existing.slug !== slug) {
        await tx
          .insert(schema.redirect)
          .values({ blogId, fromPath: existing.slug, toPath: slug })
          .onConflictDoUpdate({
            target: [schema.redirect.blogId, schema.redirect.fromPath],
            set: { toPath: slug },
          });
      }
      await tx.update(schema.post).set(values).where(eq(schema.post.id, id));
      await tx.delete(schema.postCategory).where(eq(schema.postCategory.postId, id));
    } else {
      const [created] = await tx
        .insert(schema.post)
        .values({ ...values, blogId, authorId: values.authorId })
        .returning({ id: schema.post.id });
      if (!created) throw new Error("Unable to create post");
      savedId = created.id;
    }
    if (categoryId) await tx.insert(schema.postCategory).values({ postId: savedId, categoryId });
    await tx.insert(schema.auditLog).values({
      blogId,
      actorId: session.user.id,
      action: id ? "post.updated" : "post.created",
      entityType: "post",
      entityId: savedId,
      after: { title, slug, status },
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/posts");
  revalidatePath(`/b/${process.env["PROSEWIRE_DEFAULT_BLOG"] ?? "fieldnotes"}`);
  redirect(`/posts/${savedId}/edit?saved=1`);
}

export async function bulkArchivePosts(formData: FormData): Promise<void> {
  const session = await requireDashboardSession();
  const ids = formData.getAll("postId").map(String).filter(Boolean);
  if (!ids.length) return;
  const blogId = text(formData, "blogId");
  const now = new Date();
  await db().transaction(async (tx) => {
    for (const id of ids) {
      await tx
        .update(schema.post)
        .set({ status: "archived", archivedAt: now, updatedAt: now })
        .where(and(eq(schema.post.id, id), eq(schema.post.blogId, blogId)));
      await tx.insert(schema.auditLog).values({
        blogId,
        actorId: session.user.id,
        action: "post.archived",
        entityType: "post",
        entityId: id,
      });
    }
  });
  revalidatePath("/posts");
  revalidatePath("/dashboard");
}

export async function updateBlogSettings(formData: FormData): Promise<void> {
  const session = await requireDashboardSession();
  const id = text(formData, "id");
  const values = {
    name: text(formData, "name"),
    description: text(formData, "description"),
    locale: text(formData, "locale") || "en",
    accentColor: text(formData, "accentColor") || "#ef6848",
    publicUrl: nullableText(formData, "publicUrl"),
    customCss: text(formData, "customCss"),
    updatedAt: new Date(),
  };
  await db().transaction(async (tx) => {
    await tx.update(schema.blog).set(values).where(eq(schema.blog.id, id));
    await tx.insert(schema.auditLog).values({
      blogId: id,
      actorId: session.user.id,
      action: "blog.settings_updated",
      entityType: "blog",
      entityId: id,
      after: values,
    });
  });
  revalidatePath("/settings");
  revalidatePath(`/b/${process.env["PROSEWIRE_DEFAULT_BLOG"] ?? "fieldnotes"}`);
  redirect("/settings?saved=1");
}
