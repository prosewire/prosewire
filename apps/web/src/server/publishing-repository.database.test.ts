import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { eq, inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { databaseLayer, databaseUrl } from "./database-test-support.ts";
import {
  ApiKeyId,
  AuthorId,
  BlogId,
  CategoryId,
  OrganizationId,
  PostId,
  UserId,
} from "./domain.ts";
import {
  ArchivePostsCommand,
  CreatePostCommand,
  Publishing,
  UpdateBlogSettingsInput,
  UpdatePostCommand,
} from "./publishing.ts";

async function publishing(client: ReturnType<typeof openDb>["client"]) {
  return Effect.runPromise(
    Publishing.Service.pipe(
      Effect.provide(
        Publishing.live.pipe(Layer.provide(databaseLayer(client))),
      ),
    ),
  );
}

async function cleanup(
  client: ReturnType<typeof openDb>["client"],
  organizationIds: ReadonlyArray<OrganizationId>,
  userIds: ReadonlyArray<UserId>,
) {
  if (organizationIds.length > 0) {
    await client
      .delete(schema.auditLog)
      .where(inArray(schema.auditLog.organizationId, organizationIds));
    await client
      .delete(schema.organization)
      .where(inArray(schema.organization.id, organizationIds));
  }
  if (userIds.length > 0) {
    await client.delete(schema.user).where(inArray(schema.user.id, userIds));
  }
}

describe.skipIf(!databaseUrl)("PostgreSQL publishing repository", () => {
  it("creates dashboard posts and bulk archives only with archive permission", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const ownerId = UserId.make(`user-${randomUUID()}`);
    const viewerId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const authorId = AuthorId.make(randomUUID());
    const categoryId = CategoryId.make(randomUUID());
    const deniedPostId = PostId.make(randomUUID());

    try {
      await resource.client.insert(schema.user).values([
        {
          id: ownerId,
          email: `${randomUUID()}@example.com`,
          name: "Owner",
        },
        {
          id: viewerId,
          email: `${randomUUID()}@example.com`,
          name: "Viewer",
        },
      ]);
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Publishing workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values([
        {
          id: `member-${randomUUID()}`,
          organizationId,
          userId: ownerId,
          role: "owner",
        },
        {
          id: `member-${randomUUID()}`,
          organizationId,
          userId: viewerId,
          role: "viewer",
        },
      ]);
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "Publishing",
        slug: `blog-${randomUUID()}`,
      });
      await resource.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "Owner",
        slug: `author-${randomUUID()}`,
        userId: ownerId,
      });
      await resource.client.insert(schema.category).values({
        id: categoryId,
        blogId,
        name: "Engineering",
        slug: `category-${randomUUID()}`,
      });
      await resource.client.insert(schema.post).values({
        id: deniedPostId,
        blogId,
        authorId,
        title: "Viewer cannot archive",
        slug: "viewer-cannot-archive",
        status: "draft",
        createdById: ownerId,
      });

      const service = await publishing(resource.client);
      const saved = await Effect.runPromise(
        service.createPost(
          new CreatePostCommand({
            blogId,
            authorId,
            categoryIds: [categoryId],
            title: "Created from dashboard",
            slug: "created-from-dashboard",
            excerpt: "",
            contentMarkdown: "# Dashboard post",
            status: "draft",
            featured: true,
            locale: "",
            coverImageUrl: null,
            coverImageAlt: null,
            seoTitle: null,
            seoDescription: null,
            focusKeyword: null,
            canonicalUrl: null,
            scheduledAt: null,
          }),
          { _tag: "Dashboard", userId: ownerId },
        ),
      );
      const savedId = saved.postId;
      const archived = await Effect.runPromise(
        service.archivePosts(
          new ArchivePostsCommand({
            blogId,
            postIds: [savedId],
            requireAll: false,
          }),
          { _tag: "Dashboard", userId: ownerId },
        ),
      );
      const empty = await Effect.runPromise(
        service.archivePosts(
          new ArchivePostsCommand({
            blogId,
            postIds: [],
            requireAll: false,
          }),
          { _tag: "Dashboard", userId: ownerId },
        ),
      );
      const denied = await Effect.runPromise(
        Effect.flip(
          service.archivePosts(
            new ArchivePostsCommand({
              blogId,
              postIds: [deniedPostId],
              requireAll: false,
            }),
            { _tag: "Dashboard", userId: viewerId },
          ),
        ),
      );

      expect(saved.blogSlug).toMatch(/^blog-/);
      expect(archived.archived).toBe(1);
      expect(empty.archived).toBe(0);
      expect(denied).toMatchObject({
        _tag: "BlogAccessDenied",
        capability: "content:archive",
      });
      const posts = await resource.client.query.post.findMany({
        where: inArray(schema.post.id, [savedId, deniedPostId]),
        with: { categories: true },
      });
      const byId = new Map(posts.map((post) => [post.id, post]));
      expect(byId.get(savedId)).toMatchObject({
        title: "Created from dashboard",
        slug: "created-from-dashboard",
        locale: "en",
        status: "archived",
        archivedAt: expect.any(Date),
        categories: [{ postId: savedId, categoryId, blogId }],
      });
      expect(byId.get(deniedPostId)?.status).toBe("draft");
      const revisions = await resource.client.query.postRevision.findMany({
        where: eq(schema.postRevision.postId, savedId),
      });
      expect(revisions).toHaveLength(1);
      expect(revisions[0]).toMatchObject({
        version: 1,
        snapshot: { status: "draft", title: "Created from dashboard" },
      });
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.blogId, blogId),
      });
      expect(audits.map(({ action }) => action).sort()).toEqual([
        "post.archived",
        "post.created",
      ]);
    } finally {
      await cleanup(resource.client, [organizationId], [ownerId, viewerId]);
      await resource.close();
    }
  });

  it("updates publication settings and rolls the update back when its audit fails", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const ownerId = UserId.make(`user-${randomUUID()}`);
    const viewerId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `reject_blog_settings_audit_${suffix}`;
    const triggerName = `reject_blog_settings_audit_${suffix}`;

    try {
      await resource.client.insert(schema.user).values([
        {
          id: ownerId,
          email: `${randomUUID()}@example.com`,
          name: "Owner",
        },
        {
          id: viewerId,
          email: `${randomUUID()}@example.com`,
          name: "Viewer",
        },
      ]);
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "Settings workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.member).values([
        {
          id: `member-${randomUUID()}`,
          organizationId,
          userId: ownerId,
          role: "owner",
        },
        {
          id: `member-${randomUUID()}`,
          organizationId,
          userId: viewerId,
          role: "viewer",
        },
      ]);
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "Before",
        slug: `blog-${randomUUID()}`,
      });

      const service = await publishing(resource.client);
      const input = new UpdateBlogSettingsInput({
        blogId,
        name: "After",
        description: "Updated description",
        locale: "fr",
        accentColor: "#112233",
        publicUrl: "https://example.com/publication",
        customCss: ".pw-root { color: red; }",
      });
      const slug = await Effect.runPromise(
        service.updateBlogSettings(input, ownerId),
      );
      const denied = await Effect.runPromise(
        Effect.flip(
          service.updateBlogSettings(
            new UpdateBlogSettingsInput({ ...input, name: "Unauthorized" }),
            viewerId,
          ),
        ),
      );
      expect(slug).toMatch(/^blog-/);
      expect(denied).toMatchObject({
        _tag: "BlogAccessDenied",
        capability: "publications:update",
      });

      await resource.client.$client.query(`
        create function "${functionName}"() returns trigger
        language plpgsql as $$
        begin
          if new.entity_id = tg_argv[0] and new.action = 'blog.settings_updated' then
            raise exception 'forced settings audit failure';
          end if;
          return new;
        end
        $$
      `);
      await resource.client.$client.query(`
        create trigger "${triggerName}"
        before insert on audit_log
        for each row execute function "${functionName}"('${blogId}')
      `);
      const failure = await Effect.runPromise(
        Effect.flip(
          service.updateBlogSettings(
            new UpdateBlogSettingsInput({ ...input, name: "Must roll back" }),
            ownerId,
          ),
        ),
      );
      expect(failure).toMatchObject({
        _tag: "PublishingRepositoryPersistenceError",
        operation: "blog.updateSettings",
      });

      const persisted = await resource.client.query.blog.findFirst({
        where: eq(schema.blog.id, blogId),
      });
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.blogId, blogId),
      });
      expect(persisted).toMatchObject({
        name: "After",
        description: "Updated description",
        locale: "fr",
        accentColor: "#112233",
        publicUrl: "https://example.com/publication",
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe("blog.settings_updated");
    } finally {
      await resource.client.$client.query(
        `drop trigger if exists "${triggerName}" on audit_log`,
      );
      await resource.client.$client.query(
        `drop function if exists "${functionName}"()`,
      );
      await cleanup(resource.client, [organizationId], [ownerId, viewerId]);
      await resource.close();
    }
  });

  it("creates and updates API posts with categories, revisions, redirects, and sanitized HTML", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const blogId = BlogId.make(randomUUID());
    const authorId = AuthorId.make(randomUUID());
    const categoryId = CategoryId.make(randomUUID());
    const keyId = ApiKeyId.make(randomUUID());

    try {
      await resource.client.insert(schema.organization).values({
        id: organizationId,
        name: "API workspace",
        slug: `workspace-${randomUUID()}`,
      });
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "API publication",
        slug: `blog-${randomUUID()}`,
      });
      await resource.client.insert(schema.author).values({
        id: authorId,
        blogId,
        name: "API Author",
        slug: `author-${randomUUID()}`,
      });
      await resource.client.insert(schema.category).values({
        id: categoryId,
        blogId,
        name: "Engineering",
        slug: `category-${randomUUID()}`,
      });
      await resource.client.insert(schema.apiKey).values({
        id: keyId,
        blogId,
        name: "Writer",
        prefix: `pw_${randomUUID()}`.slice(0, 10),
        keyHash: randomUUID().replaceAll("-", ""),
        scopes: ["content:read", "content:write"],
      });

      const service = await publishing(resource.client);
      const created = await Effect.runPromise(
        service.createPost(
          new CreatePostCommand({
            blogId,
            authorId,
            title: "API draft",
            slug: "api-draft",
            contentMarkdown: "# Safe\n\n<script>alert('x')</script>",
            status: "draft",
            locale: "en",
            featured: false,
            categoryIds: [categoryId, categoryId],
          }),
          { _tag: "Api", keyId },
        ),
      );
      const postId = created.postId;
      const createdPost = await resource.client.query.post.findFirst({
        where: eq(schema.post.id, postId),
        with: { categories: true },
      });
      expect(createdPost?.categories).toEqual([{ postId, categoryId, blogId }]);
      expect(createdPost?.contentHtml).not.toContain("<script>");
      await Effect.runPromise(
        service.updatePost(
          new UpdatePostCommand({
            postId,
            blogId,
            title: "API published",
            slug: "api-published",
            contentMarkdown: "## Updated\n\nVisible<script>bad()</script>",
            status: "published",
            featured: true,
            categoryIds: [],
          }),
          { _tag: "Api", keyId },
        ),
      );

      const persisted = await resource.client.query.post.findFirst({
        where: eq(schema.post.id, postId),
        with: { categories: true },
      });
      expect(persisted).toMatchObject({
        id: postId,
        title: "API published",
        slug: "api-published",
        status: "published",
        featured: true,
        publishedAt: expect.any(Date),
        categories: [],
      });
      expect(persisted?.contentHtml).toContain("Visible");
      expect(persisted?.contentHtml).not.toContain("<script>");
      const revisions = await resource.client.query.postRevision.findMany({
        where: eq(schema.postRevision.postId, postId),
      });
      const redirects = await resource.client.query.redirect.findMany({
        where: eq(schema.redirect.blogId, blogId),
      });
      const audits = await resource.client.query.auditLog.findMany({
        where: eq(schema.auditLog.blogId, blogId),
      });
      expect(revisions).toHaveLength(1);
      expect(revisions[0]).toMatchObject({
        version: 1,
        snapshot: { title: "API draft", slug: "api-draft" },
      });
      expect(redirects).toEqual([
        expect.objectContaining({
          fromPath: "api-draft",
          toPath: "api-published",
          statusCode: 301,
        }),
      ]);
      expect(audits.map(({ action }) => action).sort()).toEqual([
        "post.created",
        "post.updated",
      ]);
    } finally {
      await cleanup(resource.client, [organizationId], []);
      await resource.close();
    }
  });
});
