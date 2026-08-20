import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";
import { acceptance } from "./fixtures.ts";

test("the public reader commits a prefetched shell before post data streams", async ({
  page,
}) => {
  await page.goto(`/b/${acceptance.blog.slug}`);
  await expect(
    page.getByRole("heading", {
      name: "Acceptance Fieldnotes",
      exact: true,
    }),
  ).toBeVisible();

  await instant(page, async () => {
    await page
      .getByRole("link", { name: /Acceptance Published/ })
      .first()
      .click();
    await page.waitForURL(
      new RegExp(
        `/b/${acceptance.blog.slug}/acceptance-published$`,
      ),
    );
    await expect(page.getByLabel("Loading publication")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Acceptance Published" }),
    ).toHaveCount(0);
  });

  await expect(
    page.getByRole("heading", { name: "Acceptance Published" }),
  ).toBeVisible();
});
