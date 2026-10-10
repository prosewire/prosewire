import { expect, type Page, test } from "@playwright/test";
import { acceptance } from "./fixtures.ts";

const baseUrl =
  process.env["PROSEWIRE_ACCEPTANCE_URL"] ?? "http://localhost:3000";

async function signInTo(page: Page, email: string, returnTo = "/dashboard") {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
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
}

test.use({ extraHTTPHeaders: { "x-forwarded-for": "192.0.2.3" } });

test("opens the first workspace dashboard after an onboarding redirect", async ({
  page,
}) => {
  await signInTo(page, acceptance.onboardingOwner.email);
  await expect(page).toHaveURL(`${baseUrl}/onboarding`);
  await expect(
    page.getByRole("heading", {
      name: "Create your publishing workspace",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Navigation Workspace");
  await page
    .getByLabel("Workspace slug", { exact: true })
    .fill("navigation-workspace");
  await page
    .getByLabel("Publication name", { exact: true })
    .fill("Navigation Journal");
  await page
    .getByLabel("Public slug", { exact: true })
    .fill("navigation-journal");
  const creation = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/onboarding" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  expect((await creation).headers()["x-action-redirect"]).toBe(
    "/dashboard;push",
  );
  await expect(page).toHaveURL(`${baseUrl}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Good morning.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Navigation Journal/ }),
  ).toBeVisible();
});

test("keeps an unsafe credential return URL on the operator origin", async ({
  page,
}) => {
  let externalNavigation = false;
  await page.route("https://external.invalid/**", async (route) => {
    externalNavigation = true;
    await route.abort();
  });
  await signInTo(page, acceptance.owner.email, "/\\external.invalid/");
  await expect(page).toHaveURL(`${baseUrl}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Good morning.", exact: true }),
  ).toBeVisible();
  expect(externalNavigation).toBe(false);
});
