import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { createClient } from "@prosewire/sdk";
import { acceptance } from "./fixtures.ts";

const execute = promisify(execFile);
const baseUrl =
  process.env["PROSEWIRE_ACCEPTANCE_URL"] ?? "http://localhost:3000";
const resolvedRepositoryRoot = [
  process.cwd(),
  path.resolve(process.cwd(), "../.."),
].find((candidate) => existsSync(path.join(candidate, "packages/cli")));
if (!resolvedRepositoryRoot)
  throw new Error("Could not resolve the repository root");
const repositoryRoot: string = resolvedRepositoryRoot;
const cliPath = path.join(repositoryRoot, "packages/cli/dist/index.mjs");
const mcpPath = path.join(repositoryRoot, "packages/mcp/dist/index.mjs");
let cliCreatedPostId: string | undefined;

interface PublicList {
  readonly posts: ReadonlyArray<{
    readonly title: string;
    readonly slug: string;
  }>;
}

interface ToolText {
  readonly type: "text";
  readonly text: string;
}

async function signIn(
  page: Page,
  email: string,
  options: { navigate?: boolean; expectedPath?: string } = {},
): Promise<void> {
  const { navigate = true, expectedPath = "/posts" } = options;
  if (navigate) await page.goto(`/sign-in?returnTo=${expectedPath}`);
  await expect(page.locator("form")).toHaveAttribute("data-hydrated", "true");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(acceptance.password);
  const authentication = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-in/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect((await authentication).ok()).toBe(true);
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
}

async function withSignedInPage(
  context: BrowserContext,
  email: string,
): Promise<Page> {
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

function toolJson(result: unknown): unknown {
  if (!result || typeof result !== "object" || !("content" in result)) {
    throw new Error("Expected an immediate MCP tool result");
  }
  const content = (result as { readonly content: ReadonlyArray<unknown> })
    .content;
  const block = content[0] as ToolText | undefined;
  expect(block?.type).toBe("text");
  return JSON.parse(block?.text ?? "null") as unknown;
}

test.describe
  .serial("Postgres-backed cross-surface content matrix", () => {
    test("routes guests from the root to sign in", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/sign-in$/);
    });

    test("public raw, rendered, browser, embed, RSS, and sitemap expose only due published content", async ({
      page,
      request,
    }) => {
      const publicResponse = await request.get(
        `/api/public/${acceptance.blog.slug}/posts?search=portable&category=${acceptance.category.slug}`,
      );
      expect(publicResponse.ok()).toBe(true);
      const listing = (await publicResponse.json()) as PublicList;
      expect(listing.posts.map((post) => post.title)).toEqual([
        "Acceptance Published",
      ]);

      const unfiltered = (await (
        await request.get(`/api/public/${acceptance.blog.slug}/posts`)
      ).json()) as PublicList;
      expect(unfiltered.posts.map((post) => post.title)).toEqual([
        "Acceptance Published",
      ]);

      const rawPost = await request.get(
        `/api/public/${acceptance.blog.slug}/posts/acceptance-published`,
      );
      await expect(rawPost.json()).resolves.toMatchObject({
        post: {
          title: "Acceptance Published",
          author: { name: "Ada Editor" },
          categories: [{ slug: "engineering" }],
        },
      });
      for (const slug of [
        "acceptance-draft",
        "acceptance-scheduled",
        "acceptance-archived",
        "acceptance-future-published",
      ]) {
        expect(
          (
            await request.get(
              `/api/public/${acceptance.blog.slug}/posts/${slug}`,
            )
          ).status(),
        ).toBe(404);
      }

      const rendered = await request.get(
        `/api/rendered/${acceptance.blog.slug}/acceptance-published`,
      );
      expect(rendered.headers()["content-type"]).toContain("text/html");
      await expect(rendered.text()).resolves.toContain(
        '<article class="pw-root pw-post">',
      );

      const rss = await request.get(`/b/${acceptance.blog.slug}/rss.xml`);
      const rssBody = await rss.text();
      expect(rss.headers()["content-type"]).toContain("application/rss+xml");
      expect(rssBody).toContain("Acceptance Published");
      expect(rssBody).not.toContain("Acceptance Draft");

      const sitemap = await request.get(
        `/b/${acceptance.blog.slug}/sitemap.xml`,
      );
      const sitemapBody = await sitemap.text();
      expect(sitemapBody).toContain("acceptance-published");
      expect(sitemapBody).not.toContain("acceptance-scheduled");

      await page.goto(`/b/${acceptance.blog.slug}/acceptance-published`);
      await expect(
        page.getByRole("heading", { name: "Acceptance Published" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "About" })).toHaveAttribute(
        "href",
        `/b/${acceptance.blog.slug}/authors/${acceptance.author.slug}`,
      );
      expect(
        await page.locator('script[type="application/ld+json"]').textContent(),
      ).toContain('"@type":"BlogPosting"');

      await page.goto(
        `/b/${acceptance.blog.slug}/authors/${acceptance.author.slug}`,
      );
      expect(await page.locator("body style").textContent()).toContain(
        "--acceptance-custom-css:1",
      );

      await page.setContent(
        `<div data-prosewire="${acceptance.blog.slug}"></div><script data-blog="${acceptance.blog.slug}" data-path="acceptance-published" src="/embed.js"></script>`,
      );
      await expect(page.locator("[data-prosewire]")).toContainText(
        "Acceptance Published",
      );
      await expect(
        page.locator("[data-prosewire] article.pw-post"),
      ).toBeVisible();
    });

    test("typed SDK enforces tenancy and drives draft through scheduled, published, archived, and restored", async ({
      page,
    }) => {
      const client = createClient({ baseUrl, apiKey: acceptance.apiKey });
      const readOnly = createClient({
        baseUrl,
        apiKey: acceptance.readOnlyApiKey,
      });
      const otherTenant = createClient({
        baseUrl,
        apiKey: acceptance.otherApiKey,
      });

      const initial = await client.posts.list({ page: 1, pageSize: 100 });
      expect(new Set(initial.items.map((post) => post.status))).toEqual(
        new Set(["draft", "scheduled", "published", "archived"]),
      );
      expect(initial.items.map((post) => post.title)).not.toContain(
        "Other Tenant Secret",
      );
      await expect(
        client.posts.list({
          blog: acceptance.blog.slug,
          page: 1,
          pageSize: 100,
        }),
      ).resolves.toMatchObject({ total: initial.total });
      await expect(
        client.posts.list({
          blog: acceptance.blog.id,
          page: 1,
          pageSize: 100,
        }),
      ).resolves.toMatchObject({ total: initial.total });
      await expect(
        client.posts.list({
          blog: acceptance.otherBlog.slug,
          page: 1,
          pageSize: 100,
        }),
      ).rejects.toThrow();
      expect(
        (await otherTenant.posts.list({ page: 1, pageSize: 100 })).items,
      ).toHaveLength(1);

      const createInput = {
        blogId: acceptance.blog.id,
        authorId: acceptance.author.id,
        title: "Lifecycle Acceptance",
        slug: "lifecycle-acceptance",
        excerpt: "Moves through the complete content lifecycle.",
        contentMarkdown:
          "## Lifecycle\n\nVisible after publish.<script>alert('x')</script>",
        status: "draft" as const,
        locale: "en",
        featured: false,
        categoryIds: [acceptance.category.id],
      };
      await expect(readOnly.posts.create(createInput)).rejects.toThrow();
      await expect(
        client.posts.create({
          ...createInput,
          blogId: acceptance.otherBlog.id,
        }),
      ).rejects.toThrow();

      const draft = await client.posts.create(createInput);
      expect(draft.status).toBe("draft");
      const scheduled = await client.posts.update({
        params: { id: draft.id },
        body: {
          status: "scheduled",
          scheduledAt: "2099-02-01T09:00:00.000Z",
        },
      });
      expect(scheduled).toMatchObject({
        status: "scheduled",
        scheduledAt: expect.any(String),
      });

      const published = await client.posts.update({
        params: { id: draft.id },
        body: { status: "published", slug: "lifecycle-published" },
      });
      expect(published).toMatchObject({
        status: "published",
        slug: "lifecycle-published",
      });
      const rendered = await (
        await fetch(
          `${baseUrl}/api/rendered/${acceptance.blog.slug}/lifecycle-published`,
        )
      ).text();
      expect(rendered).toContain("Visible after publish");
      expect(rendered).not.toContain("<script>");

      await expect(
        client.posts.archive({ params: { id: draft.id } }),
      ).resolves.toEqual({ ok: true });
      expect(
        (
          await fetch(
            `${baseUrl}/api/public/${acceptance.blog.slug}/posts/lifecycle-published`,
          )
        ).status,
      ).toBe(404);

      const restored = await client.posts.update({
        params: { id: draft.id },
        body: { status: "published" },
      });
      expect(restored.status).toBe("published");
      const rawRedirect = await fetch(
        `${baseUrl}/api/public/${acceptance.blog.slug}/posts/lifecycle-acceptance`,
        { redirect: "manual" },
      );
      expect(rawRedirect.status).toBe(301);
      expect(rawRedirect.headers.get("location")).toBe(
        `/api/public/${acceptance.blog.slug}/posts/lifecycle-published`,
      );
      const renderedRedirect = await fetch(
        `${baseUrl}/api/rendered/${acceptance.blog.slug}/lifecycle-acceptance`,
        { redirect: "manual" },
      );
      expect(renderedRedirect.status).toBe(301);
      expect(renderedRedirect.headers.get("location")).toBe(
        `/api/rendered/${acceptance.blog.slug}/lifecycle-published`,
      );
      await page.goto(`/b/${acceptance.blog.slug}`);
      await page.setContent(
        `<div data-prosewire="${acceptance.blog.slug}"></div><script data-blog="${acceptance.blog.slug}" data-path="lifecycle-acceptance" src="/embed.js"></script>`,
      );
      await expect(page.locator("[data-prosewire]")).toContainText(
        "Lifecycle Acceptance",
      );
      await page.goto(`/b/${acceptance.blog.slug}/lifecycle-acceptance`);
      await expect(page).toHaveURL(
        new RegExp(`/b/${acceptance.blog.slug}/lifecycle-published$`),
      );
      await expect(
        page.getByRole("heading", { name: "Lifecycle Acceptance" }),
      ).toBeVisible();
    });

    test("CLI reads public content and creates a private draft through the production API", async () => {
      const common = ["--url", baseUrl];
      const listed = await execute(
        process.execPath,
        [cliPath, ...common, "posts", "--blog", acceptance.blog.slug],
        { cwd: repositoryRoot },
      );
      const listing = JSON.parse(listed.stdout) as PublicList;
      expect(listing.posts.map((post) => post.title)).toContain(
        "Acceptance Published",
      );
      expect(listing.posts.map((post) => post.title)).not.toContain(
        "Acceptance Draft",
      );

      const directory = await mkdtemp(`${tmpdir()}/prosewire-acceptance-`);
      try {
        const inputPath = `${directory}/post.json`;
        await writeFile(
          inputPath,
          JSON.stringify({
            blogId: acceptance.blog.id,
            authorId: acceptance.author.id,
            title: "CLI Acceptance Draft",
            slug: "cli-acceptance-draft",
            contentMarkdown: "Created by the real CLI.",
            status: "draft",
            locale: "en",
            featured: false,
            categoryIds: [],
          }),
        );
        const created = await execute(
          process.execPath,
          [
            cliPath,
            ...common,
            "--key",
            acceptance.apiKey,
            "create",
            "--data",
            inputPath,
          ],
          { cwd: repositoryRoot },
        );
        const post = JSON.parse(created.stdout) as {
          id: string;
          status: string;
        };
        expect(post.status).toBe("draft");
        cliCreatedPostId = post.id;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    test("MCP exposes real SDK reads and archives a Postgres-backed post", async () => {
      const postId = cliCreatedPostId;
      if (!postId) throw new Error("CLI acceptance post was not created");
      const client = new McpClient({ name: "acceptance", version: "1.0.0" });
      const inheritedEnvironment = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      );
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [mcpPath],
        cwd: repositoryRoot,
        env: {
          ...inheritedEnvironment,
          PROSEWIRE_API_URL: baseUrl,
          PROSEWIRE_API_KEY: acceptance.apiKey,
        },
        stderr: "pipe",
      });
      await client.connect(transport);
      try {
        expect(
          toolJson(
            await client.callTool({ name: "publication_get", arguments: {} }),
          ),
        ).toEqual({
          publications: [
            expect.objectContaining({ slug: acceptance.blog.slug }),
          ],
        });
        const posts = toolJson(
          await client.callTool({
            name: "posts_list",
            arguments: { status: "draft", pageSize: 100 },
          }),
        ) as { items: ReadonlyArray<{ id: string; title: string }> };
        expect(posts.items.map((post) => post.title)).toContain(
          "CLI Acceptance Draft",
        );

        expect(
          toolJson(
            await client.callTool({
              name: "posts_archive",
              arguments: { id: postId },
            }),
          ),
        ).toEqual({ ok: true });
        const archived = await createClient({
          baseUrl,
          apiKey: acceptance.apiKey,
        }).posts.get({ params: { id: postId } });
        expect(archived.status).toBe("archived");
      } finally {
        await client.close();
      }
    });

    test("dashboard browser flow honors tenant membership and owner/viewer roles", async ({
      browser,
    }) => {
      const ownerContext = await browser.newContext();
      const viewerContext = await browser.newContext();
      const otherContext = await browser.newContext();
      try {
        const owner = await withSignedInPage(
          ownerContext,
          acceptance.owner.email,
        );
        await owner.goto("/");
        await expect(owner).toHaveURL(/\/dashboard$/);
        await owner.goto("/posts");
        await expect(
          owner.locator('a[href="/posts"][aria-current="page"]:visible'),
        ).toBeVisible();
        await expect(
          owner.getByRole("link", { name: "New post" }),
        ).toBeVisible();
        await expect(
          owner.getByRole("button", { name: "Archive selected" }),
        ).toBeVisible();
        await expect(
          owner.getByText("Acceptance Published", { exact: true }),
        ).toBeVisible();
        await expect(
          owner.getByText("Other Tenant Secret", { exact: true }),
        ).toHaveCount(0);
        await owner.goto("/integrate");
        await expect(
          owner.locator('a[href="/integrate"][aria-current="page"]:visible'),
        ).toBeVisible();
        await owner.setViewportSize({ width: 390, height: 844 });
        await owner.locator('summary[aria-label="Open navigation"]').click();
        await expect(
          owner.locator('a[href="/integrate"][aria-current="page"]:visible'),
        ).toBeVisible();

        await owner.setViewportSize({ width: 1440, height: 900 });
        await owner.goto("/posts/new");
        const categorySummary = owner.getByText("1 category", {
          exact: true,
        });
        await expect(categorySummary).toBeVisible();
        await categorySummary.click();
        await expect(
          owner.getByLabel("Engineering", { exact: true }),
        ).toBeChecked();
        await owner.getByLabel("Product", { exact: true }).check();
        await expect(
          owner.getByText("2 categories", { exact: true }),
        ).toBeVisible();

        await owner.setViewportSize({ width: 390, height: 844 });
        await expect(
          owner.getByText("2 categories", { exact: true }),
        ).toBeVisible();
        await expect(
          owner.getByRole("button", { name: "Save draft" }),
        ).toBeVisible();

        const viewer = await withSignedInPage(
          viewerContext,
          acceptance.viewer.email,
        );
        await expect(
          viewer.getByRole("link", { name: "New post" }),
        ).toHaveCount(0);
        await expect(
          viewer.getByRole("button", { name: "Archive selected" }),
        ).toHaveCount(0);
        await expect(
          viewer.getByText("Acceptance Published", { exact: true }),
        ).toBeVisible();

        const other = await withSignedInPage(
          otherContext,
          acceptance.otherOwner.email,
        );
        await expect(
          other.getByText("Other Tenant Secret", { exact: true }),
        ).toBeVisible();
        await expect(
          other.getByText("Acceptance Published", { exact: true }),
        ).toHaveCount(0);
      } finally {
        await Promise.all([
          ownerContext.close(),
          viewerContext.close(),
          otherContext.close(),
        ]);
      }
    });
  });
