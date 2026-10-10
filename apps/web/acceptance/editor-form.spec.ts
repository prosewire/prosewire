import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@prosewire/sdk";
import { acceptance } from "./fixtures.ts";

const baseUrl =
  process.env["PROSEWIRE_ACCEPTANCE_URL"] ?? "http://localhost:3000";
const client = createClient({ baseUrl, apiKey: acceptance.apiKey });

async function openNewPost(page: Page) {
  await page.goto("/sign-in?returnTo=/posts/new");
  await expect(page.locator("form")).toHaveAttribute("data-hydrated", "true");
  await page.getByLabel("Email").fill(acceptance.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(acceptance.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/posts\/new$/);
  await expect(
    page.getByRole("tab", { name: "SEO", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}

async function writePost(page: Page, title: string) {
  await page
    .getByRole("textbox", { name: "Post title", exact: true })
    .fill(title);
  await page
    .locator('[contenteditable="true"]')
    .fill("A first post created through the real dashboard form.");
  await expect(page.locator('input[name="contentMarkdown"]')).toHaveValue(
    "A first post created through the real dashboard form.",
  );
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/posts\/[a-f0-9-]+\/edit\?saved=1$/);
  const id = new URL(page.url()).pathname.split("/")[2];
  if (!id) throw new Error("Saved post URL did not contain an ID");
  await expect(page.locator('form input[name="id"]')).toHaveValue(id);
  return client.posts.get({ params: { id } });
}

test("saves a first draft from the default SEO tab", async ({ page }) => {
  await openNewPost(page);
  await writePost(page, "Default editor first draft");
  const saved = await saveDraft(page);
  expect(saved).toMatchObject({
    title: "Default editor first draft",
    slug: "default-editor-first-draft",
    author: { id: acceptance.author.id },
    locale: "en",
    status: "draft",
  });
  expect(
    (
      await page.request.get(
        `/api/public/${acceptance.blog.slug}/posts/${saved.slug}`,
      )
    ).status(),
  ).toBe(404);
  await page.goto(`/b/${acceptance.blog.slug}/${saved.slug}`);
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(
    page.getByRole("heading", { name: saved.title, exact: true }),
  ).toHaveCount(0);
});

test("preserves publication settings across tabs and closed mobile settings", async ({
  page,
}) => {
  await openNewPost(page);
  await writePost(page, "Focused editor first draft");
  await page.getByRole("tab", { name: "post", exact: true }).click();
  await page.getByLabel("Engineering", { exact: true }).check();
  await page.getByLabel("Product", { exact: true }).check();
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await page.locator('input[name="seoTitle"]').fill("Preserved search title");
  await page.getByRole("tab", { name: "social", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Hide settings", exact: true })
    .click();
  const saved = await saveDraft(page);
  expect(saved).toMatchObject({
    author: { id: acceptance.author.id },
    locale: "en",
    seoTitle: "Preserved search title",
    status: "draft",
  });
  expect(saved.categories.map((category) => category.id)).toEqual(
    expect.arrayContaining([
      acceptance.category.id,
      acceptance.secondCategory.id,
    ]),
  );
  expect(saved.categories).toHaveLength(2);
});

test("publishes from the Post tab to the real public reader", async ({
  page,
}) => {
  await openNewPost(page);
  await writePost(page, "Post tab first publish");
  await page.getByRole("tab", { name: "post", exact: true }).click();
  const draft = await saveDraft(page);
  expect(draft.status).toBe("draft");
  await page.getByRole("tab", { name: "post", exact: true }).click();
  const publication = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/posts/${draft.id}/edit`,
  );
  await page.getByRole("button", { name: "Publish post", exact: true }).click();
  expect((await publication).ok()).toBe(true);
  await expect
    .poll(
      async () => (await client.posts.get({ params: { id: draft.id } })).status,
    )
    .toBe("published");
  await expect(page).toHaveURL(/\/posts\/[a-f0-9-]+\/edit\?saved=1$/);
  await page.goto(`/b/${acceptance.blog.slug}/post-tab-first-publish`);
  await expect(
    page.getByRole("heading", { name: "Post tab first publish", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".pw-prose")
      .getByText("A first post created through the real dashboard form.", {
        exact: true,
      }),
  ).toBeVisible();
});
