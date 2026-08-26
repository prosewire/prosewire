import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";
import { acceptance } from "./fixtures.ts";

test("dashboard navigation does not animate the shared sidebar", async ({
  page,
}) => {
  // The cross-surface flow signs in three browser contexts before this test.
  // Give this independent browser its own authentication rate-limit bucket.
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": "192.0.2.1",
  });
  await page.goto("/sign-in?returnTo=/dashboard");
  await expect(page.locator("form")).toHaveAttribute("data-hydrated", "true");
  await page.getByLabel("Email").fill(acceptance.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(acceptance.password);
  const authentication = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-in/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect((await authentication).ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Good morning." }),
  ).toBeVisible();

  await page.evaluate(() => {
    const probedWindow = window as Window & {
      __dashboardSidebar?: Element | null;
      __dashboardTransitions?: Array<string>;
    };
    const sidebar = document.querySelector("aside");
    probedWindow.__dashboardSidebar = sidebar;
    probedWindow.__dashboardTransitions = [];
    sidebar?.addEventListener(
      "transitionrun",
      (event) => {
        if (event.target instanceof HTMLAnchorElement) {
          probedWindow.__dashboardTransitions?.push(event.propertyName);
        }
      },
      true,
    );
  });

  const postsLink = page.getByRole("link", { name: "Posts", exact: true });
  await postsLink.hover();
  await postsLink.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  await page.evaluate(() => {
    (
      window as Window & { __dashboardTransitions?: Array<string> }
    ).__dashboardTransitions = [];
  });
  await postsLink.click();
  await expect(page).toHaveURL(/\/posts$/);
  await expect(page.getByRole("heading", { name: "Posts" })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const probedWindow = window as Window & {
        __dashboardSidebar?: Element | null;
        __dashboardTransitions?: Array<string>;
      };
      const retained = probedWindow.__dashboardSidebar;
      return {
        retained:
          retained?.isConnected && retained === document.querySelector("aside"),
        transitions: probedWindow.__dashboardTransitions,
      };
    }),
  ).toEqual({ retained: true, transitions: [] });
});

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
      new RegExp(`/b/${acceptance.blog.slug}/acceptance-published$`),
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
