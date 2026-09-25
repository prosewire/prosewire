import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { eq, inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { ApiContent } from "./api-content.ts";
import { ContentQueries } from "./content-queries.ts";
import { databaseLayer, databaseUrl } from "./database-test-support.ts";
import {
  AuthorId,
  BlogId,
  BlogSlug,
  CategoryId,
  OrganizationId,
  PostId,
  UserId,
} from "./domain.ts";

interface Fixture {
  readonly organizationId: OrganizationId;
  readonly otherOrganizationId: OrganizationId;
  readonly ownerId: UserId;
  readonly teammateId: UserId;
  readonly blogId: BlogId;
  readonly otherBlogId: BlogId;
  readonly blogSlug: BlogSlug;
  readonly primaryAuthorId: AuthorId;
  readonly secondaryAuthorId: AuthorId;
  readonly categoryId: CategoryId;
  readonly firstPostId: PostId;
  readonly secondPostId: PostId;
  readonly futurePostId: PostId;
  readonly draftPostId: PostId;
  readonly otherPostId: PostId;
}

async function contentQueries(client: ReturnType<typeof openDb>["client"]) {
  return Effect.runPromise(
    ContentQueries.Service.pipe(
      Effect.provide(
        ContentQueries.layer.pipe(Layer.provide(databaseLayer(client))),
      ),
    ),
  );
}

async function apiContent(client: ReturnType<typeof openDb>["client"]) {
  return Effect.runPromise(
    ApiContent.Service.pipe(
      Effect.provide(
        ApiContent.layer.pipe(Layer.provide(databaseLayer(client))),
      ),
    ),
  );
}

async function seed(
  client: ReturnType<typeof openDb>["client"],
): Promise<Fixture> {
  const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
  const otherOrganizationId = OrganizationId.make(`workspace-${randomUUID()}`);
  const ownerId = UserId.make(`user-${randomUUID()}`);
  const teammateId = UserId.make(`user-${randomUUID()}`);
  const blogId = BlogId.make(randomUUID());
  const otherBlogId = BlogId.make(randomUUID());
  const blogSlug = BlogSlug.make(`blog-${randomUUID()}`);
  const primaryAuthorId = AuthorId.make(randomUUID());
  const secondaryAuthorId = AuthorId.make(randomUUID());
  const otherAuthorId = AuthorId.make(randomUUID());
  const categoryId = CategoryId.make(randomUUID());
  const otherCategoryId = CategoryId.make(randomUUID());
  const firstPostId = PostId.make(randomUUID());
  const secondPostId = PostId.make(randomUUID());
  const futurePostId = PostId.make(randomUUID());
  const draftPostId = PostId.make(randomUUID());
  const otherPostId = PostId.make(randomUUID());
  const now = Date.now();

  await client.insert(schema.user).values([
    {
      id: ownerId,
      email: `${randomUUID()}@example.com`,
      name: "Ada Owner",
    },
    {
      id: teammateId,
      email: `${randomUUID()}@example.com`,
      name: "Grace Viewer",
    },
  ]);
  await client.insert(schema.organization).values([
    {
      id: organizationId,
      name: "Primary workspace",
      slug: `workspace-${randomUUID()}`,
    },
    {
      id: otherOrganizationId,
      name: "Other workspace",
      slug: `workspace-${randomUUID()}`,
    },
  ]);
  await client.insert(schema.member).values([
    {
      id: `member-${randomUUID()}`,
      organizationId,
      userId: ownerId,
      role: "owner",
    },
    {
      id: `member-${randomUUID()}`,
      organizationId,
      userId: teammateId,
      role: "member",
    },
  ]);
  await client.insert(schema.blog).values([
    {
      id: blogId,
      organizationId,
      name: "Fieldnotes",
      slug: blogSlug,
      description: "Primary publication",
    },
    {
      id: otherBlogId,
      organizationId: otherOrganizationId,
      name: "Other publication",
      slug: `blog-${randomUUID()}`,
    },
  ]);
  await client.insert(schema.author).values([
    {
      id: primaryAuthorId,
      blogId,
      name: "Ada Alpha",
      slug: "ada-alpha",
      userId: ownerId,
    },
    {
      id: secondaryAuthorId,
      blogId,
      name: "Zed Writer",
      slug: "zed-writer",
    },
    {
      id: otherAuthorId,
      blogId: otherBlogId,
      name: "Other Writer",
      slug: "other-writer",
    },
  ]);
  await client.insert(schema.category).values([
    {
      id: categoryId,
      blogId,
      name: "Engineering",
      slug: "engineering",
    },
    {
      id: otherCategoryId,
      blogId: otherBlogId,
      name: "Engineering",
      slug: "engineering",
    },
  ]);
  await client.insert(schema.post).values([
    {
      id: firstPostId,
      blogId,
      authorId: primaryAuthorId,
      title: "Portable Alpha",
      slug: "portable-alpha",
      excerpt: "Alpha database behavior",
      contentMarkdown: "Portable alpha content",
      contentHtml: "<p>Portable alpha content</p>",
      status: "published",
      featured: true,
      publishedAt: new Date(now - 86_400_000),
      updatedAt: new Date(now - 1_000),
    },
    {
      id: secondPostId,
      blogId,
      authorId: secondaryAuthorId,
      title: "Portable Beta",
      slug: "portable-beta",
      excerpt: "Beta database behavior",
      contentMarkdown: "Portable beta content",
      contentHtml: "<p>Portable beta content</p>",
      status: "published",
      publishedAt: new Date(now - 172_800_000),
      updatedAt: new Date(now - 2_000),
    },
    {
      id: futurePostId,
      blogId,
      authorId: primaryAuthorId,
      title: "Future public post",
      slug: "future-public-post",
      status: "published",
      publishedAt: new Date(now + 86_400_000),
      updatedAt: new Date(now - 3_000),
    },
    {
      id: draftPostId,
      blogId,
      authorId: primaryAuthorId,
      title: "Private draft",
      slug: "private-draft",
      status: "draft",
      updatedAt: new Date(now - 4_000),
    },
    {
      id: otherPostId,
      blogId: otherBlogId,
      authorId: otherAuthorId,
      title: "Other tenant secret",
      slug: "other-tenant-secret",
      status: "published",
      publishedAt: new Date(now - 86_400_000),
    },
  ]);
  await client.insert(schema.postCategory).values({
    postId: firstPostId,
    categoryId,
    blogId,
  });
  await client.insert(schema.postRevision).values({
    postId: firstPostId,
    editorId: ownerId,
    version: 1,
    snapshot: {
      authorId: primaryAuthorId,
      title: "Older Alpha",
      slug: "older-alpha",
      excerpt: "Older excerpt",
      contentMarkdown: "Older content",
      contentHtml: "<p>Older content</p>",
      coverImageUrl: null,
      coverImageAlt: null,
      status: "published",
      locale: "en",
      featured: false,
      seoTitle: null,
      seoDescription: null,
      focusKeyword: null,
      canonicalUrl: null,
      scheduledAt: null,
      publishedAt: new Date(now - 172_800_000).toISOString(),
      archivedAt: null,
      categoryIds: [categoryId],
    },
  });
  await client.insert(schema.postView).values([
    {
      postId: firstPostId,
      eventId: randomUUID(),
      referrer: "search",
      occurredAt: new Date(now - 3_600_000),
    },
    {
      postId: firstPostId,
      eventId: randomUUID(),
      referrer: "direct",
      occurredAt: new Date(now - 1_800_000),
    },
  ]);
  await client.insert(schema.snippet).values({
    blogId,
    name: "Callout",
    key: `callout-${randomUUID()}`,
    contentMarkdown: "Reusable content",
  });
  await client.insert(schema.redirect).values({
    blogId,
    fromPath: "old-alpha",
    toPath: "portable-alpha",
  });
  await client.insert(schema.invitation).values([
    {
      id: `invitation-${randomUUID()}`,
      organizationId,
      email: `${randomUUID()}@example.com`,
      role: "viewer",
      inviterId: ownerId,
      expiresAt: new Date(now + 86_400_000),
    },
    {
      id: `invitation-${randomUUID()}`,
      organizationId,
      email: `${randomUUID()}@example.com`,
      role: "viewer",
      status: "canceled",
      inviterId: ownerId,
      expiresAt: new Date(now + 86_400_000),
    },
  ]);
  await client.insert(schema.apiKey).values({
    blogId,
    name: "Reader",
    prefix: `pw_${randomUUID()}`.slice(0, 10),
    keyHash: randomUUID().replaceAll("-", ""),
    scopes: ["content:read"],
  });
  await client.insert(schema.auditLog).values({
    organizationId,
    blogId,
    actorId: ownerId,
    action: "post.created",
    entityType: "post",
    entityId: firstPostId,
  });

  return {
    organizationId,
    otherOrganizationId,
    ownerId,
    teammateId,
    blogId,
    otherBlogId,
    blogSlug,
    primaryAuthorId,
    secondaryAuthorId,
    categoryId,
    firstPostId,
    secondPostId,
    futurePostId,
    draftPostId,
    otherPostId,
  };
}

async function cleanup(
  client: ReturnType<typeof openDb>["client"],
  fixture: Fixture,
) {
  await client
    .delete(schema.auditLog)
    .where(
      inArray(schema.auditLog.organizationId, [
        fixture.organizationId,
        fixture.otherOrganizationId,
      ]),
    );
  await client
    .delete(schema.organization)
    .where(
      inArray(schema.organization.id, [
        fixture.organizationId,
        fixture.otherOrganizationId,
      ]),
    );
  await client
    .delete(schema.user)
    .where(inArray(schema.user.id, [fixture.ownerId, fixture.teammateId]));
}

describe.skipIf(!databaseUrl)("PostgreSQL content queries", () => {
  it("scopes dashboard reads and computes related counts through real joins", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const fixture = await seed(resource.client);

    try {
      const content = await contentQueries(resource.client);
      const authors = await Effect.runPromise(
        content.getAuthors(fixture.blogId),
      );
      const categories = await Effect.runPromise(
        content.getCategories(fixture.blogId),
      );
      const posts = await Effect.runPromise(
        content.getDashboardPosts(fixture.blogId, "Alpha"),
      );
      const detail = await Effect.runPromise(
        content.getDashboardPost(fixture.firstPostId),
      );
      const metrics = await Effect.runPromise(
        content.getDashboardMetrics(fixture.blogId),
      );
      const series = await Effect.runPromise(
        content.getViewSeries(fixture.blogId),
      );
      const library = await Effect.runPromise(
        content.getContentLibrary(fixture.blogId),
      );
      const team = await Effect.runPromise(
        content.getTeam(fixture.organizationId, fixture.blogId),
      );
      const invitations = await Effect.runPromise(
        content.getPendingInvitations(fixture.organizationId),
      );
      const keys = await Effect.runPromise(content.getApiKeys(fixture.blogId));
      const audits = await Effect.runPromise(
        content.getAuditLog(fixture.organizationId),
      );

      expect(authors.map(({ name }) => name)).toEqual([
        "Ada Alpha",
        "Zed Writer",
      ]);
      expect(categories.map(({ name }) => name)).toEqual(["Engineering"]);
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        id: fixture.firstPostId,
        viewCount: 2,
        author: { id: fixture.primaryAuthorId },
        categories: [
          {
            postId: fixture.firstPostId,
            categoryId: fixture.categoryId,
            category: { id: fixture.categoryId },
          },
        ],
      });
      expect(detail).toMatchObject({
        id: fixture.firstPostId,
        revisions: [{ version: 1, snapshot: { title: "Older Alpha" } }],
      });
      expect(metrics).toEqual({
        total: 4,
        published: 3,
        drafts: 1,
        scheduled: 0,
        authors: 2,
        views: 2,
      });
      expect(series.reduce((sum, point) => sum + point.value, 0)).toBe(2);
      expect(library).toMatchObject({
        authors: expect.any(Array),
        categories: expect.any(Array),
        snippets: [expect.objectContaining({ name: "Callout" })],
        redirects: [
          expect.objectContaining({
            fromPath: "old-alpha",
            toPath: "portable-alpha",
          }),
        ],
      });
      expect(team.members).toEqual([
        expect.objectContaining({ userId: fixture.ownerId, role: "owner" }),
        expect.objectContaining({ userId: fixture.teammateId, role: "viewer" }),
      ]);
      expect(invitations).toHaveLength(1);
      expect(keys).toEqual([
        expect.objectContaining({ blogId: fixture.blogId, name: "Reader" }),
      ]);
      expect(audits).toEqual([
        expect.objectContaining({
          actorName: "Ada Owner",
          publicationName: "Fieldnotes",
          action: "post.created",
        }),
      ]);
    } finally {
      await cleanup(resource.client, fixture);
      await resource.close();
    }
  });

  it("applies public predicates, author and category filters, redirects, and view deduplication", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const fixture = await seed(resource.client);

    try {
      const content = await contentQueries(resource.client);
      const blog = await Effect.runPromise(
        content.getPublicBlog(fixture.blogSlug),
      );
      const author = await Effect.runPromise(
        content.getPublicAuthor(fixture.blogId, "ada-alpha"),
      );
      const all = await Effect.runPromise(
        content.getPublicPosts(fixture.blogId),
      );
      const searched = await Effect.runPromise(
        content.getPublicPosts(fixture.blogId, { search: "alpha" }),
      );
      const categorized = await Effect.runPromise(
        content.getPublicPosts(fixture.blogId, { category: "engineering" }),
      );
      const authored = await Effect.runPromise(
        content.getPublicPosts(fixture.blogId, {
          authorId: fixture.secondaryAuthorId,
          limit: null,
        }),
      );
      const paged = await Effect.runPromise(
        content.getPublicPosts(fixture.blogId, { limit: 1, offset: 1 }),
      );
      const post = await Effect.runPromise(
        content.getPublicPost(fixture.blogId, "portable-alpha"),
      );
      const future = await Effect.runPromise(
        content.getPublicPost(fixture.blogId, "future-public-post"),
      );
      const redirect = await Effect.runPromise(
        content.getPublicRedirect(fixture.blogId, "old-alpha"),
      );
      const redirects = await Effect.runPromise(
        content.getPublicRedirects(fixture.blogId),
      );
      const eventId = randomUUID();
      const firstView = await Effect.runPromise(
        content.recordPostView(fixture.firstPostId, eventId, "newsletter"),
      );
      const duplicateView = await Effect.runPromise(
        content.recordPostView(fixture.firstPostId, eventId, "duplicate"),
      );
      const privateView = await Effect.runPromise(
        content.recordPostView(fixture.draftPostId, randomUUID(), null),
      );

      expect(blog?.id).toBe(fixture.blogId);
      expect(author?.id).toBe(fixture.primaryAuthorId);
      expect(all.map(({ id }) => id)).toEqual([
        fixture.firstPostId,
        fixture.secondPostId,
      ]);
      expect(searched.map(({ id }) => id)).toEqual([fixture.firstPostId]);
      expect(categorized.map(({ id }) => id)).toEqual([fixture.firstPostId]);
      expect(authored.map(({ id }) => id)).toEqual([fixture.secondPostId]);
      expect(paged.map(({ id }) => id)).toEqual([fixture.secondPostId]);
      expect(post?.id).toBe(fixture.firstPostId);
      expect(future).toBeUndefined();
      expect(redirect).toBe("portable-alpha");
      expect(redirects).toEqual([
        expect.objectContaining({ fromPath: "old-alpha" }),
      ]);
      expect(firstView).toBe(true);
      expect(duplicateView).toBe(true);
      expect(privateView).toBe(false);
      await expect(
        resource.client.$count(
          schema.postView,
          eq(schema.postView.eventId, eventId),
        ),
      ).resolves.toBe(1);
    } finally {
      await cleanup(resource.client, fixture);
      await resource.close();
    }
  });

  it("paginates and scopes private API reads to the authenticated publication", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const fixture = await seed(resource.client);

    try {
      const api = await apiContent(resource.client);
      await expect(Effect.runPromise(api.health())).resolves.toMatchObject({
        status: "ok",
      });
      const blogs = await Effect.runPromise(api.listBlogs(fixture.blogId));
      const firstPage = await Effect.runPromise(
        api.listPosts(fixture.blogId, {
          status: "published",
          search: "Portable",
          page: 1,
          pageSize: 1,
        }),
      );
      const secondPage = await Effect.runPromise(
        api.listPosts(fixture.blogId, {
          status: "published",
          search: "Portable",
          page: 2,
          pageSize: 1,
        }),
      );
      const post = await Effect.runPromise(
        api.getPost(fixture.blogId, fixture.firstPostId),
      );
      const revisions = await Effect.runPromise(
        api.listPostRevisions(fixture.blogId, fixture.firstPostId),
      );
      const denied = await Effect.runPromise(
        Effect.flip(api.getPost(fixture.blogId, fixture.otherPostId)),
      );
      const deniedRevisions = await Effect.runPromise(
        Effect.flip(api.listPostRevisions(fixture.blogId, fixture.otherPostId)),
      );

      expect(blogs).toEqual([
        expect.objectContaining({
          id: fixture.blogId,
          slug: fixture.blogSlug,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      ]);
      expect(firstPage).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(secondPage).toMatchObject({ total: 2, page: 2, pageSize: 1 });
      expect([firstPage.items[0]?.id, secondPage.items[0]?.id]).toEqual([
        fixture.firstPostId,
        fixture.secondPostId,
      ]);
      expect(post).toMatchObject({
        id: fixture.firstPostId,
        author: { id: fixture.primaryAuthorId },
        categories: [expect.objectContaining({ id: fixture.categoryId })],
      });
      expect(revisions).toEqual([
        expect.objectContaining({
          postId: fixture.firstPostId,
          editorId: fixture.ownerId,
          version: 1,
          createdAt: expect.any(String),
          snapshot: expect.objectContaining({
            title: "Older Alpha",
            categoryIds: [fixture.categoryId],
          }),
        }),
      ]);
      expect(denied).toMatchObject({
        _tag: "PostNotFound",
        postId: fixture.otherPostId,
      });
      expect(deniedRevisions).toMatchObject({
        _tag: "PostNotFound",
        postId: fixture.otherPostId,
      });
    } finally {
      await cleanup(resource.client, fixture);
      await resource.close();
    }
  });
});
