import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openDb } from "@prosewire/db/client";
import * as schema from "@prosewire/db/schema";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { acceptance } from "./fixtures.ts";

const resolvedRepositoryRoot = [
  process.cwd(),
  path.resolve(process.cwd(), "../.."),
].find((candidate) => existsSync(path.join(candidate, "packages/db/drizzle")));
if (!resolvedRepositoryRoot)
  throw new Error("Could not resolve the repository root");
const repositoryRoot: string = resolvedRepositoryRoot;
const apiKeyHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for Postgres-backed acceptance tests",
    );
  }
  const parsedDatabaseUrl = new URL(databaseUrl);
  const databaseName = parsedDatabaseUrl.pathname.slice(1);
  const searchPath = parsedDatabaseUrl.searchParams
    .get("options")
    ?.match(/search_path(?:=|%3D)([a-zA-Z0-9_]+)/i)?.[1];
  if (
    !/(acceptance|test)/i.test(databaseName) &&
    !/(acceptance|test)/i.test(searchPath ?? "")
  ) {
    throw new Error(
      `Refusing to reset non-test database ${databaseName}; use a test database or an acceptance search_path`,
    );
  }

  const administrativeUrl = new URL(databaseUrl);
  administrativeUrl.pathname = "/postgres";
  const administrativeClient = new Client({
    connectionString: administrativeUrl.toString(),
  });
  await administrativeClient.connect();
  try {
    const existing = await administrativeClient.query<{ exists: boolean }>(
      "select exists(select 1 from pg_database where datname = $1)",
      [databaseName],
    );
    if (!existing.rows[0]?.exists) {
      if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
        throw new Error(
          "Acceptance database name contains unsupported characters",
        );
      }
      await administrativeClient.query(`create database "${databaseName}"`);
    }
  } finally {
    await administrativeClient.end();
  }

  const resource = openDb(databaseUrl);
  const database = resource.client;
  try {
    const schemaName = searchPath ?? "public";
    if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
      throw new Error("Acceptance schema name contains unsupported characters");
    }
    await database.execute(
      sql.raw(`drop schema if exists "${schemaName}" cascade`),
    );
    await database.execute(sql.raw(`create schema "${schemaName}"`));
    const migrationsDirectory = path.join(
      repositoryRoot,
      "packages/db/drizzle",
    );
    const journal = JSON.parse(
      await readFile(
        path.join(migrationsDirectory, "meta/_journal.json"),
        "utf8",
      ),
    ) as { entries: ReadonlyArray<{ tag: string }> };
    for (const entry of journal.entries) {
      const migration = (
        await readFile(
          path.join(migrationsDirectory, `${entry.tag}.sql`),
          "utf8",
        )
      ).replaceAll('"public".', `"${schemaName}".`);
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await database.execute(sql.raw(statement));
      }
    }

    const password = await hashPassword(acceptance.password);
    await database.insert(schema.user).values([
      {
        id: acceptance.owner.id,
        email: acceptance.owner.email,
        name: "Acceptance Owner",
        emailVerified: true,
      },
      {
        id: acceptance.viewer.id,
        email: acceptance.viewer.email,
        name: "Acceptance Viewer",
        emailVerified: true,
      },
      {
        id: acceptance.otherOwner.id,
        email: acceptance.otherOwner.email,
        name: "Other Tenant Owner",
        emailVerified: true,
      },
      {
        id: acceptance.workspaceLessOwner.id,
        email: acceptance.workspaceLessOwner.email,
        name: "Workspace-less Owner",
        emailVerified: true,
      },
      {
        id: acceptance.publicationLessOwner.id,
        email: acceptance.publicationLessOwner.email,
        name: "Publication-less Owner",
        emailVerified: true,
      },
    ]);
    await database.insert(schema.account).values([
      {
        id: "acceptance-owner-account",
        userId: acceptance.owner.id,
        accountId: acceptance.owner.id,
        providerId: "credential",
        issuer: "local:credential",
        password,
      },
      {
        id: "acceptance-viewer-account",
        userId: acceptance.viewer.id,
        accountId: acceptance.viewer.id,
        providerId: "credential",
        issuer: "local:credential",
        password,
      },
      {
        id: "acceptance-other-owner-account",
        userId: acceptance.otherOwner.id,
        accountId: acceptance.otherOwner.id,
        providerId: "credential",
        issuer: "local:credential",
        password,
      },
      {
        id: "acceptance-workspace-less-owner-account",
        userId: acceptance.workspaceLessOwner.id,
        accountId: acceptance.workspaceLessOwner.id,
        providerId: "credential",
        issuer: "local:credential",
        password,
      },
      {
        id: "acceptance-publication-less-owner-account",
        userId: acceptance.publicationLessOwner.id,
        accountId: acceptance.publicationLessOwner.id,
        providerId: "credential",
        issuer: "local:credential",
        password,
      },
    ]);
    await database.insert(schema.organization).values([
      {
        id: acceptance.organization.id,
        name: "Acceptance Workspace",
        slug: acceptance.organization.slug,
      },
      {
        id: acceptance.otherOrganization.id,
        name: "Other Workspace",
        slug: acceptance.otherOrganization.slug,
      },
      {
        id: acceptance.publicationLessOrganization.id,
        name: "Publication-less Workspace",
        slug: acceptance.publicationLessOrganization.slug,
      },
    ]);
    await database.insert(schema.member).values([
      {
        id: "acceptance-owner-member",
        organizationId: acceptance.organization.id,
        userId: acceptance.owner.id,
        role: "owner",
      },
      {
        id: "acceptance-viewer-member",
        organizationId: acceptance.organization.id,
        userId: acceptance.viewer.id,
        role: "viewer",
      },
      {
        id: "acceptance-other-owner-member",
        organizationId: acceptance.otherOrganization.id,
        userId: acceptance.otherOwner.id,
        role: "owner",
      },
      {
        id: "acceptance-publication-less-owner-member",
        organizationId: acceptance.publicationLessOrganization.id,
        userId: acceptance.publicationLessOwner.id,
        role: "owner",
      },
    ]);
    await database.insert(schema.blog).values([
      {
        id: acceptance.blog.id,
        organizationId: acceptance.organization.id,
        name: "Acceptance Fieldnotes",
        slug: acceptance.blog.slug,
        description: "Postgres-backed publishing acceptance fixtures.",
        customCss: ":root{--acceptance-custom-css:1}",
      },
      {
        id: acceptance.otherBlog.id,
        organizationId: acceptance.otherOrganization.id,
        name: "Other Tenant Publication",
        slug: acceptance.otherBlog.slug,
        description: "Must remain isolated.",
      },
    ]);
    await database.insert(schema.author).values([
      {
        id: acceptance.author.id,
        blogId: acceptance.blog.id,
        userId: acceptance.owner.id,
        name: "Ada Editor",
        slug: acceptance.author.slug,
        bio: "Maintains the acceptance matrix.",
      },
      {
        id: acceptance.otherAuthor.id,
        blogId: acceptance.otherBlog.id,
        userId: acceptance.otherOwner.id,
        name: "Other Author",
        slug: "other-author",
      },
    ]);
    await database.insert(schema.category).values([
      {
        id: acceptance.category.id,
        blogId: acceptance.blog.id,
        name: "Engineering",
        slug: acceptance.category.slug,
      },
      {
        id: acceptance.secondCategory.id,
        blogId: acceptance.blog.id,
        name: "Product",
        slug: acceptance.secondCategory.slug,
      },
    ]);
    await database.insert(schema.apiKey).values([
      {
        blogId: acceptance.blog.id,
        name: "Acceptance read/write",
        prefix: "pw_acceptance",
        keyHash: apiKeyHash(acceptance.apiKey),
        scopes: ["content:read", "content:write"],
      },
      {
        blogId: acceptance.blog.id,
        name: "Acceptance read only",
        prefix: "pw_acceptance",
        keyHash: apiKeyHash(acceptance.readOnlyApiKey),
        scopes: ["content:read"],
      },
      {
        blogId: acceptance.otherBlog.id,
        name: "Other tenant",
        prefix: "pw_acceptance",
        keyHash: apiKeyHash(acceptance.otherApiKey),
        scopes: ["content:read", "content:write"],
      },
    ]);

    const past = new Date("2026-01-15T09:00:00.000Z");
    const future = new Date("2099-01-15T09:00:00.000Z");
    await database.insert(schema.post).values([
      {
        id: acceptance.posts.draft,
        blogId: acceptance.blog.id,
        authorId: acceptance.author.id,
        createdById: acceptance.owner.id,
        title: "Acceptance Draft",
        slug: "acceptance-draft",
        excerpt: "Private draft fixture.",
        contentMarkdown: "## Draft only",
        contentHtml: '<h2 id="draft-only">Draft only</h2>',
        status: "draft",
      },
      {
        id: acceptance.posts.scheduled,
        blogId: acceptance.blog.id,
        authorId: acceptance.author.id,
        createdById: acceptance.owner.id,
        title: "Acceptance Scheduled",
        slug: "acceptance-scheduled",
        excerpt: "Future scheduled fixture.",
        contentMarkdown: "## Scheduled later",
        contentHtml: '<h2 id="scheduled-later">Scheduled later</h2>',
        status: "scheduled",
        scheduledAt: future,
      },
      {
        id: acceptance.posts.published,
        blogId: acceptance.blog.id,
        authorId: acceptance.author.id,
        createdById: acceptance.owner.id,
        title: "Acceptance Published",
        slug: "acceptance-published",
        excerpt: "The one public fixture with portable search terms.",
        contentMarkdown: "## Portable publishing\n\nVisible on every surface.",
        contentHtml:
          '<h2 id="portable-publishing">Portable publishing</h2><p>Visible on every surface.</p>',
        status: "published",
        featured: true,
        publishedAt: past,
      },
      {
        id: acceptance.posts.archived,
        blogId: acceptance.blog.id,
        authorId: acceptance.author.id,
        createdById: acceptance.owner.id,
        title: "Acceptance Archived",
        slug: "acceptance-archived",
        excerpt: "Archived fixture.",
        contentMarkdown: "Archived",
        contentHtml: "<p>Archived</p>",
        status: "archived",
        publishedAt: past,
        archivedAt: past,
      },
      {
        id: acceptance.posts.futurePublished,
        blogId: acceptance.blog.id,
        authorId: acceptance.author.id,
        createdById: acceptance.owner.id,
        title: "Acceptance Future Published",
        slug: "acceptance-future-published",
        excerpt: "Status alone must not make this public.",
        contentMarkdown: "Future",
        contentHtml: "<p>Future</p>",
        status: "published",
        publishedAt: future,
      },
      {
        id: acceptance.posts.otherTenant,
        blogId: acceptance.otherBlog.id,
        authorId: acceptance.otherAuthor.id,
        createdById: acceptance.otherOwner.id,
        title: "Other Tenant Secret",
        slug: "other-tenant-secret",
        excerpt: "Must never cross tenant boundaries.",
        contentMarkdown: "Other tenant",
        contentHtml: "<p>Other tenant</p>",
        status: "published",
        publishedAt: past,
      },
    ]);
    await database.insert(schema.postCategory).values({
      postId: acceptance.posts.published,
      categoryId: acceptance.category.id,
      blogId: acceptance.blog.id,
    });
  } finally {
    await resource.close();
  }
}
