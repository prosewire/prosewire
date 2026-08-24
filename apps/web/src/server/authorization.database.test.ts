import { randomUUID } from "node:crypto";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { BlogAccess } from "./authorization.ts";
import { databaseLayer, databaseUrl } from "./database-test-support.ts";
import { BlogId, OrganizationId, UserId } from "./domain.ts";

async function blogAccess(client: ReturnType<typeof openDb>["client"]) {
  return Effect.runPromise(
    BlogAccess.Service.pipe(
      Effect.provide(
        BlogAccess.layer.pipe(Layer.provide(databaseLayer(client))),
      ),
    ),
  );
}

describe.skipIf(!databaseUrl)("PostgreSQL authorization capabilities", () => {
  it("resolves dashboard selections and every owner capability through persisted memberships", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const ownerId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const secondOrganizationId = OrganizationId.make(
      `workspace-${randomUUID()}`,
    );
    const firstBlogId = BlogId.make(randomUUID());
    const secondBlogId = BlogId.make(randomUUID());

    try {
      await resource.client.insert(schema.user).values({
        id: ownerId,
        email: `${randomUUID()}@example.com`,
        name: "Owner",
      });
      await resource.client.insert(schema.organization).values([
        {
          id: organizationId,
          name: "Zulu workspace",
          slug: `workspace-${randomUUID()}`,
        },
        {
          id: secondOrganizationId,
          name: "Alpha workspace",
          slug: `workspace-${randomUUID()}`,
        },
      ]);
      await resource.client.insert(schema.member).values([
        {
          id: `member-${randomUUID()}`,
          organizationId,
          userId: ownerId,
          role: "owner",
        },
        {
          id: `member-${randomUUID()}`,
          organizationId: secondOrganizationId,
          userId: ownerId,
          role: "member",
        },
      ]);
      await resource.client.insert(schema.blog).values([
        {
          id: firstBlogId,
          organizationId,
          name: "Zulu publication",
          slug: `blog-${randomUUID()}`,
        },
        {
          id: secondBlogId,
          organizationId,
          name: "Alpha publication",
          slug: `blog-${randomUUID()}`,
        },
      ]);

      const access = await blogAccess(resource.client);
      const workspaces = await Effect.runPromise(
        access.findWorkspaces(ownerId),
      );
      const workspace = await Effect.runPromise(
        access.findWorkspace(organizationId, ownerId),
      );
      const publication = await Effect.runPromise(
        access.findBlog(secondBlogId, ownerId),
      );
      const context = await Effect.runPromise(
        access.dashboardContext(ownerId, organizationId, secondBlogId),
      );
      await Effect.runPromise(
        Effect.all([
          access.requireRead(firstBlogId, ownerId),
          access.requirePostCreate(firstBlogId, ownerId),
          access.requirePostUpdate(firstBlogId, ownerId, null),
          access.requirePublish(firstBlogId, ownerId),
          access.requireArchive(firstBlogId, ownerId, null),
          access.requireAnalytics(firstBlogId, ownerId),
          access.requireAuditRead(organizationId, ownerId),
          access.requireIntegrationsRead(firstBlogId, ownerId),
          access.requireIntegrationsManage(firstBlogId, ownerId),
          access.requirePublicationUpdate(firstBlogId, ownerId),
          access.requireWorkspaceUpdate(organizationId, ownerId),
          access.requireMembersManage(organizationId, ownerId),
          access.requirePublicationCreate(organizationId, ownerId),
        ]),
      );

      expect(workspaces.map(({ workspace: item }) => item.name)).toEqual([
        "Alpha workspace",
        "Zulu workspace",
      ]);
      expect(workspaces[0]?.role).toBe("viewer");
      expect(workspace?.role).toBe("owner");
      expect(publication?.blog.id).toBe(secondBlogId);
      expect(context).toMatchObject({
        workspace: { id: organizationId },
        publication: { id: secondBlogId },
        role: "owner",
      });
      expect(context.publications.map(({ name }) => name)).toEqual([
        "Alpha publication",
        "Zulu publication",
      ]);
    } finally {
      await resource.client
        .delete(schema.organization)
        .where(
          inArray(schema.organization.id, [
            organizationId,
            secondOrganizationId,
          ]),
        );
      await resource.client
        .delete(schema.user)
        .where(inArray(schema.user.id, [ownerId]));
      await resource.close();
    }
  });

  it("enforces own-post rules and reports missing workspace and publication selections", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const resource = openDb(databaseUrl);
    const authorId = UserId.make(`user-${randomUUID()}`);
    const outsiderId = UserId.make(`user-${randomUUID()}`);
    const organizationId = OrganizationId.make(`workspace-${randomUUID()}`);
    const emptyOrganizationId = OrganizationId.make(
      `workspace-${randomUUID()}`,
    );
    const blogId = BlogId.make(randomUUID());

    try {
      await resource.client.insert(schema.user).values([
        {
          id: authorId,
          email: `${randomUUID()}@example.com`,
          name: "Author",
        },
        {
          id: outsiderId,
          email: `${randomUUID()}@example.com`,
          name: "Outsider",
        },
      ]);
      await resource.client.insert(schema.organization).values([
        {
          id: organizationId,
          name: "Author workspace",
          slug: `workspace-${randomUUID()}`,
        },
        {
          id: emptyOrganizationId,
          name: "Empty workspace",
          slug: `workspace-${randomUUID()}`,
        },
      ]);
      await resource.client.insert(schema.member).values([
        {
          id: `member-${randomUUID()}`,
          organizationId,
          userId: authorId,
          role: "author",
        },
        {
          id: `member-${randomUUID()}`,
          organizationId: emptyOrganizationId,
          userId: outsiderId,
          role: "viewer",
        },
      ]);
      await resource.client.insert(schema.blog).values({
        id: blogId,
        organizationId,
        name: "Author publication",
        slug: `blog-${randomUUID()}`,
      });

      const access = await blogAccess(resource.client);
      await expect(
        Effect.runPromise(access.requirePostUpdate(blogId, authorId, authorId)),
      ).resolves.toMatchObject({ role: "author" });
      const anotherAuthorsPost = await Effect.runPromise(
        Effect.flip(access.requirePostUpdate(blogId, authorId, outsiderId)),
      );
      const archiveDenied = await Effect.runPromise(
        Effect.flip(access.requireArchive(blogId, authorId, authorId)),
      );
      const noWorkspace = await Effect.runPromise(
        Effect.flip(
          access.dashboardContext(UserId.make(`missing-${randomUUID()}`)),
        ),
      );
      const noPublication = await Effect.runPromise(
        Effect.flip(access.dashboardContext(outsiderId, emptyOrganizationId)),
      );

      expect(anotherAuthorsPost).toMatchObject({
        _tag: "BlogAccessDenied",
        capability: "content:update:any",
      });
      expect(archiveDenied).toMatchObject({
        _tag: "BlogAccessDenied",
        capability: "content:archive",
      });
      expect(noWorkspace).toMatchObject({ _tag: "NoWorkspaceAvailable" });
      expect(noPublication).toMatchObject({
        _tag: "NoPublicationAvailable",
        organizationId: emptyOrganizationId,
      });
    } finally {
      await resource.client
        .delete(schema.organization)
        .where(
          inArray(schema.organization.id, [
            organizationId,
            emptyOrganizationId,
          ]),
        );
      await resource.client
        .delete(schema.user)
        .where(inArray(schema.user.id, [authorId, outsiderId]));
      await resource.close();
    }
  });
});
